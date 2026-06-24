import { apiError, decodesToToken } from "./apierr.js";
import { authedFetch, sanitize } from "./auth.js";
import type { Repo } from "./validate.js";

const API = "https://api.github.com";

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

/** owner/name URL-encoded for a `/repos/{owner}/{repo}` path segment. */
function repoPath(repo: Repo): string {
  return `${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
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
  if (typeof value !== "string" || value === "") return false;
  // Never echo a URL carrying the token in any encoded form (invariant 3).
  if (decodesToToken(value, token)) return false;
  // Printable ASCII only: a real comment URL is percent-encoded, so this rejects
  // spaces, control chars, and terminal escapes a tampered response could embed
  // (e.g. in the #fragment) that would forge stderr/CI log lines once echoed.
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code < 0x21 || code > 0x7e) return false;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.search !== ""
  ) {
    return false;
  }
  // Require the value to be already canonical (a real github.com URL is): reject
  // anything new URL() had to normalize — path traversal (`/../`), a mixed-case
  // host — so we never report a misleading or non-canonical comment link.
  if (url.href !== value) return false;
  // Bind to the upload target: owner/repo (case-insensitive, as GitHub
  // canonicalizes casing), the issues/pull collection, and the exact number —
  // then require the created-comment fragment.
  const seg = url.pathname.split("/");
  if (
    seg.length !== 5 ||
    seg[1]?.toLowerCase() !== repo.owner.toLowerCase() ||
    seg[2]?.toLowerCase() !== repo.name.toLowerCase() ||
    (seg[3] !== "issues" && seg[3] !== "pull") ||
    seg[4] !== String(number)
  ) {
    return false;
  }
  return /^#issuecomment-\d+$/.test(url.hash);
}

/**
 * Decode the HTML/Markdown character references GitHub's Markdown renderer
 * resolves, so the public-surface token check sees what will actually be
 * published. Numeric refs are matched at ANY length — they may carry leading
 * zeros (`&#x000005F;`, `&#00000095;` both render as `_`) — with a value guard
 * (a code point past U+10FFFF is left as text, as the renderer would). Covers
 * `&#95;`/`&#x5F;` for any char and the named refs for the token's `_` separator
 * (`&lowbar;`/`&UnderBar;`); since a token is `[A-Za-z0-9_]`, numeric refs plus
 * those `_` names are every way to encode it. Percent and `\u` escapes are
 * deliberately NOT decoded here — Markdown renders them literally, so they can't
 * leak in a comment (decodesToToken still covers them in the caller).
 */
function decodeMarkdownEntities(s: string): string {
  return s
    .replace(/&#[xX]([0-9A-Fa-f]+);?/g, (m, h) => {
      const code = Number.parseInt(h, 16);
      return code <= 0x10ffff ? String.fromCodePoint(code) : m;
    })
    .replace(/&#(\d+);?/g, (m, d) => {
      const code = Number.parseInt(d, 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : m;
    })
    .replace(/&(?:lowbar|UnderBar);/g, "_");
}

/**
 * Remove CommonMark backslash escapes (a backslash before an ASCII punctuation
 * char renders the char literally) so the public-surface token check sees what
 * GitHub renders. `\_` -> _ is the only one that matters for a [A-Za-z0-9_]
 * token (the sole ASCII-punctuation token char); a backslash before a
 * non-punctuation char is left intact.
 */
function unescapeMarkdownBackslash(s: string): string {
  return s.replace(/\\([!-\/:-@[-`{-~])/g, "$1");
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
  const rendered = unescapeMarkdownBackslash(decodeMarkdownEntities(body));
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
