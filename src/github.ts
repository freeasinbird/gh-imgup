import { apiError, decodesToToken } from "./apierr.js";
import { API, authedFetch, repoPath, sanitize } from "./auth.js";
import { renderInlineMarkdown } from "./markdown.js";
import type { Repo } from "./validate.js";
import { boundGithubUrl } from "./validate.js";

/** Injectable I/O for the comment function (real defaults in production). */
export interface GithubDeps {
  fetchImpl?: typeof fetch;
  warn?: (message: string) => void;
}

function depsOf(deps: GithubDeps): {
  fetchImpl: typeof fetch;
  warn: (m: string) => void;
} {
  return {
    fetchImpl: deps.fetchImpl ?? fetch,
    warn:
      deps.warn ??
      ((m) => {
        process.stderr.write(m);
      }),
  };
}

/** Outcome of posting a comment. */
export interface CommentResult {
  /** The created comment's `html_url`, or "" if the 201 had no usable one. */
  url: string;
  /** The issue/PR number commented on. */
  number: number;
}

/**
 * Whether a created-comment `html_url` is a usable, token-free github.com URL
 * that actually points at THIS comment, safe to echo (to stderr). The comment is
 * already posted on a 201, so this only gates whether we *report* the URL — a
 * tampered or odd one is dropped, not fatal. Binds to the target: a real
 * created-comment URL is `/{owner}/{repo}/(issues|pull)/{number}` with an
 * `#issuecomment-<id>` fragment, so a malformed 201 pointing at another
 * repo/issue or a non-comment page is rejected rather than reported.
 */
function usableCommentUrl(
  value: unknown,
  repo: Repo,
  number: number,
  token: string,
): value is string {
  // Never echo a URL carrying the token in any encoded form (invariant 3).
  if (typeof value !== "string" || decodesToToken(value, token)) return false;
  // Shared re-binding core (printable ASCII, https github.com, no
  // creds/port/query, canonical, owner/repo bound) — see boundGithubUrl.
  const bound = boundGithubUrl(value, repo);
  if (!bound) return false;
  // Bind to the upload target: the issues/pull collection and the exact
  // number — then require the created-comment fragment.
  const { url, segments } = bound;
  if (
    segments.length !== 5 ||
    (segments[3] !== "issues" && segments[3] !== "pull") ||
    segments[4] !== String(number)
  ) {
    return false;
  }
  return /^#issuecomment-\d+$/.test(url.hash);
}

/**
 * Post `body` as a comment on issue/PR `#number`. PRs and issues share the
 * Issues comments endpoint (`POST /repos/{owner}/{repo}/issues/{number}/comments`),
 * so one function serves both; the caller decides which flag mapped to `number`.
 *
 * A comment renders on a PUBLIC surface — the highest-stakes place a token could
 * leak — so it refuses outright to post a body that contains the token in any
 * encoded form rather than publishing the credential. On success it returns the
 * created comment's `html_url` (or "" when the 201 body has no usable one); the
 * comment exists either way, so a malformed success body warns rather than fails.
 * Non-2xx responses raise a sanitized {@link apiError} with the `issues:write`
 * scope hint.
 */
export async function postComment(
  token: string,
  repo: Repo,
  number: number,
  body: string,
  deps: GithubDeps = {},
): Promise<CommentResult> {
  const { fetchImpl, warn } = depsOf(deps);
  // A comment renders as Markdown on a PUBLIC surface, so refuse if the body
  // would contain the token either as raw text / any escape (decodesToToken) or
  // after GitHub renders it — decoding its HTML/Markdown character references
  // and removing backslash escapes (\_ -> _).
  const rendered = renderInlineMarkdown(body);
  if (decodesToToken(body, token) || decodesToToken(rendered, token)) {
    throw new Error(
      sanitize(
        token,
        "Refusing to post a comment whose body contains the GitHub token.",
      ),
    );
  }
  const res = await authedFetch(
    token,
    `${API}/repos/${repoPath(repo)}/issues/${number}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    },
    fetchImpl,
  );
  if (res.status !== 201) {
    throw await apiError(token, res, `Comment on #${number}`, "issues:write");
  }
  const created = (await res.json().catch(() => null)) as {
    html_url?: unknown;
  } | null;
  const htmlUrl = created?.html_url;
  if (!usableCommentUrl(htmlUrl, repo, number, token)) {
    warn(
      sanitize(
        token,
        `⚠ Comment posted on #${number}, but the response had no usable URL.\n`,
      ),
    );
    return { url: "", number };
  }
  return { url: htmlUrl, number };
}
