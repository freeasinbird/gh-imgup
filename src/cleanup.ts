import { createInterface } from "node:readline/promises";
import { apiError, redactField } from "./apierr.js";
import { API, authedFetch, repoPath, sanitize } from "./auth.js";
import { renderInlineMarkdown } from "./markdown.js";
import { deleteAsset, isUsableAssetUrl, releaseId } from "./release.js";
import type { Repo } from "./validate.js";

/** A release asset that is a candidate for deletion. */
interface Asset {
  id: number;
  /** The asset filename (`{stem}-{hex}.{ext}`). */
  name: string;
  /** The public `browser_download_url` — the exact string our markdown embeds. */
  url: string;
}

/** Injectable I/O for cleanup (real, interactive defaults in production). */
export interface CleanupDeps {
  fetchImpl?: typeof fetch;
  /** Live progress/warning sink (stderr in production). */
  warn?: (message: string) => void;
  /** Whether stdin is a TTY — the destructive prompt is refused if not. */
  isTTY?: boolean;
  /** Ask a yes/no question, resolving true only on an explicit yes. */
  confirm?: (question: string) => Promise<boolean>;
}

/** Read one yes/no answer from stdin, prompting on stderr (keeps stdout clean). */
async function defaultConfirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

function depsOf(deps: CleanupDeps): {
  fetchImpl: typeof fetch;
  warn: (m: string) => void;
  isTTY: boolean;
  confirm: (q: string) => Promise<boolean>;
} {
  return {
    fetchImpl: deps.fetchImpl ?? fetch,
    warn:
      deps.warn ??
      ((m) => {
        process.stderr.write(m);
      }),
    isTTY: deps.isTTY ?? Boolean(process.stdin.isTTY),
    confirm: deps.confirm ?? defaultConfirm,
  };
}

/** Thrown when a `Link` header is present but can't be parsed; the caller in
 * {@link listPages} turns this into a fail-closed abort (never a silent "no next
 * page", which would skip a page and risk deleting an asset referenced there). */
const LINK_PARSE_ERROR = "unparseable Link header";

/**
 * Parse an RFC 8288 `Link` header into its link-values — each a `<uri-reference>`
 * followed by `;`-separated parameters. A character scan rather than splitting on
 * `,`/`;` so a comma or semicolon inside the `<…>` target or a quoted parameter
 * value isn't mistaken for a delimiter, and so the `rel` parameter is found
 * wherever it sits among the params. GitHub can place other parameters (e.g.
 * `type="…"`) before `rel`, and a regex demanding `rel="next"` immediately after
 * the target would miss the next page and silently end the scan one page early —
 * the delete-a-live-asset direction. Throws {@link LINK_PARSE_ERROR} on a
 * structurally malformed header (no parseable link-value, an unterminated `<` or
 * quote, a stray delimiter) so the caller fails closed rather than treating
 * garbage as "no next page". `rel` tokens are lowercased (relation types are
 * case-insensitive); other params are ignored.
 */
function parseLinkHeader(
  header: string,
): Array<{ uri: string; rel: string[] }> {
  const links: Array<{ uri: string; rel: string[] }> = [];
  const n = header.length;
  let i = 0;
  const isOws = (c: string) => c === " " || c === "\t";
  const skipOws = () => {
    while (i < n && isOws(header[i] as string)) i += 1;
  };
  while (i < n) {
    skipOws();
    if (i >= n) break;
    if (header[i] !== "<") throw new Error(LINK_PARSE_ERROR);
    const end = header.indexOf(">", i + 1);
    if (end === -1) throw new Error(LINK_PARSE_ERROR);
    const uri = header.slice(i + 1, end);
    i = end + 1;
    let rel: string[] = [];
    let relSeen = false;
    skipOws();
    while (i < n && header[i] === ";") {
      i += 1;
      skipOws();
      const nameStart = i;
      while (
        i < n &&
        header[i] !== "=" &&
        header[i] !== ";" &&
        header[i] !== ","
      ) {
        i += 1;
      }
      const name = header.slice(nameStart, i).trim().toLowerCase();
      let value = "";
      if (i < n && header[i] === "=") {
        i += 1;
        skipOws();
        if (i < n && header[i] === '"') {
          i += 1;
          let v = "";
          while (i < n && header[i] !== '"') {
            if (header[i] === "\\" && i + 1 < n) i += 1;
            v += header[i];
            i += 1;
          }
          if (i >= n) throw new Error(LINK_PARSE_ERROR); // unterminated quote
          i += 1;
          value = v;
        } else {
          const vStart = i;
          while (i < n && header[i] !== ";" && header[i] !== ",") i += 1;
          value = header.slice(vStart, i).trim();
        }
      }
      if (name === "rel") {
        // RFC 8288 says a repeated `rel` keeps the FIRST occurrence. Rather than
        // silently pick one, fail closed on a duplicate: on this destructive path
        // an anomalous header must abort the scan (keep), never be reinterpreted
        // into "no next page" (e.g. `rel="next"; rel="last"` skipping a page).
        if (relSeen) throw new Error(LINK_PARSE_ERROR);
        relSeen = true;
        rel = value
          .toLowerCase()
          .split(/\s+/)
          .filter((s) => s !== "");
        // A `rel` carrying no relation token (`; rel`, `; rel=`, `; rel=""`) is
        // malformed — `rel` is required to be non-empty. Fail closed for the same
        // reason: an empty `rel` would otherwise read as "no next page" and could
        // end the scan a page early on the destructive path.
        if (rel.length === 0) throw new Error(LINK_PARSE_ERROR);
      }
      skipOws();
    }
    links.push({ uri, rel });
    skipOws();
    if (i < n) {
      if (header[i] !== ",") throw new Error(LINK_PARSE_ERROR);
      i += 1;
    }
  }
  return links;
}

/**
 * The `rel="next"` URL from a GitHub `Link` pagination header, or null when the
 * header is absent / empty or carries no `next` relation (the legitimate last
 * page). Throws (via {@link parseLinkHeader}) on a malformed header so the scan
 * fails closed instead of treating an unreadable header as the end of pagination.
 */
export function rawNextLink(header: string | null): string | null {
  if (!header || header.trim() === "") return null;
  for (const link of parseLinkHeader(header)) {
    if (link.rel.includes("next")) return link.uri;
  }
  return null;
}

/**
 * Query parameters GitHub may add to a `rel="next"` URL beyond the original
 * query: the page number plus an opaque cursor on some endpoints (the issues
 * list returns `after`). These are exempt from the "preserve the original
 * query" check; every other key must already have been in the start URL.
 *
 * The cursor is an ACCEPTED RESIDUAL. It is an opaque token, so nothing can
 * validate it — a tampered `rel=next` could keep a contiguous `page` while its
 * `after` points past intervening results, skipping a slice the scan never
 * sees. We can't reject it (GitHub's issues `rel=next` always carries `after`;
 * rejecting it re-breaks real pagination) and can't verify it. The alternative
 * — ignoring it and self-paginating by `page` — trades the cursor's churn
 * stability for skips under concurrent edits (the delete-a-live-asset
 * direction) and loops on a future cursor-only endpoint. And the attack needs a
 * response from authenticated api.github.com that could equally hide a
 * reference in a page body, defeating the scan regardless. So we follow
 * GitHub's cursor and bind everything else (host/repo/endpoint/query/page).
 */
const PAGINATION_PARAMS = new Set(["page", "after", "before"]);

/**
 * Split a GitHub list-endpoint path into the repo it targets and the endpoint
 * beneath that repo. GitHub addresses a repo two ways and swaps between them
 * freely: the named `/repos/{owner}/{repo}/…` form we request, and the numeric
 * `/repositories/{id}/…` form it returns in `Link` headers. Returns null for any
 * other path shape (so an off-target jump is rejected by the caller).
 */
function splitRepoPath(
  pathname: string,
):
  | { kind: "named"; owner: string; repo: string; endpoint: string }
  | { kind: "id"; id: string; endpoint: string }
  | null {
  const seg = pathname.split("/").filter((s) => s !== "");
  const [first, owner, repo] = seg;
  if (first === "repos" && owner !== undefined && repo !== undefined) {
    return { kind: "named", owner, repo, endpoint: seg.slice(3).join("/") };
  }
  if (first === "repositories" && owner !== undefined) {
    return { kind: "id", id: owner, endpoint: seg.slice(2).join("/") };
  }
  return null;
}

/**
 * The validated `rel="next"` URL for the same GitHub list endpoint we started
 * scanning. The host allowlist in authedFetch is necessary but not enough here:
 * cleanup's safety depends on scanning THIS repo surface completely before
 * deleting. A response-derived Link that jumps to another repo or a different
 * endpoint, strips the original query (e.g. `state=all`), or loops would make
 * the scan incomplete, so reject it and abort before the destructive phase.
 *
 * GitHub rewrites the named repo path to its numeric `/repositories/{id}` form
 * in `Link` headers, so that rewrite is accepted — but only for THIS repo: the
 * id is re-bound to `expectedRepoId` (resolved once up front), so a Link to
 * `/repositories/<other-id>/…` is rejected just as a different named repo is. A
 * different endpoint beneath the repo, or a non-repo path, is also rejected.
 *
 * The page number must advance by exactly one. Forward-only isn't enough: a Link
 * that jumps from page 1 to page 999 (with no further `next`) would make the
 * scan skip pages 2-998 and still look complete, leaving an asset referenced
 * there eligible for deletion. Contiguity proves no page was skipped.
 */
function nextLink(
  header: string | null,
  startUrl: URL,
  currentUrl: URL,
  expectedRepoId: number,
): string | null {
  const raw = rawNextLink(header);
  if (raw === null) return null;
  let next: URL;
  try {
    next = new URL(raw);
  } catch {
    throw new Error("unsafe pagination URL");
  }
  if (
    next.protocol !== startUrl.protocol ||
    next.host !== startUrl.host ||
    next.username !== "" ||
    next.password !== "" ||
    next.hash !== ""
  ) {
    throw new Error("unsafe pagination URL");
  }

  // Same repo, same endpoint beneath it — accepting GitHub's numeric-id rewrite.
  const from = splitRepoPath(startUrl.pathname);
  const to = splitRepoPath(next.pathname);
  if (from === null || to === null || from.endpoint !== to.endpoint) {
    throw new Error("unsafe pagination URL");
  }
  if (to.kind === "named") {
    if (
      from.kind !== "named" ||
      to.owner.toLowerCase() !== from.owner.toLowerCase() ||
      to.repo.toLowerCase() !== from.repo.toLowerCase()
    ) {
      throw new Error("unsafe pagination URL");
    }
  } else if (to.id !== String(expectedRepoId)) {
    throw new Error("unsafe pagination URL");
  }

  const expectedKeys = new Set(startUrl.searchParams.keys());
  for (const key of next.searchParams.keys()) {
    if (!PAGINATION_PARAMS.has(key) && !expectedKeys.has(key)) {
      throw new Error("unsafe pagination URL");
    }
  }
  for (const key of expectedKeys) {
    if (
      !PAGINATION_PARAMS.has(key) &&
      next.searchParams.getAll(key).join("\0") !==
        startUrl.searchParams.getAll(key).join("\0")
    ) {
      throw new Error("unsafe pagination URL");
    }
  }
  const page = next.searchParams.get("page");
  const currentPage = Number(currentUrl.searchParams.get("page") ?? "1");
  const nextPage = Number(page);
  if (
    page === null ||
    !/^[1-9]\d*$/.test(page) ||
    next.searchParams.getAll("page").length !== 1 ||
    !Number.isSafeInteger(currentPage) ||
    nextPage !== currentPage + 1
  ) {
    throw new Error("unsafe pagination URL");
  }
  return next.href;
}

/**
 * Yield every page of a paginated GitHub list endpoint, following `Link`
 * rel="next". A non-200 or a non-array page THROWS — an incomplete scan must
 * abort cleanup rather than risk deleting an asset whose reference we didn't see.
 */
async function* listPages(
  token: string,
  startUrl: string,
  fetchImpl: typeof fetch,
  scope: string,
  expectedRepoId: number,
): AsyncGenerator<unknown[]> {
  const expected = new URL(startUrl);
  const seen = new Set<string>();
  let next: string | null = startUrl;
  while (next) {
    if (seen.has(next)) {
      throw new Error(
        sanitize(
          token,
          "Repository scan returned a repeated pagination URL; aborting without deleting.",
        ),
      );
    }
    seen.add(next);
    const res = await authedFetch(token, next, {}, fetchImpl);
    if (res.status !== 200) {
      throw await apiError(token, res, "Scan repository", scope);
    }
    const page = (await res.json().catch(() => null)) as unknown;
    if (!Array.isArray(page)) {
      throw new Error(
        sanitize(
          token,
          "Repository scan returned an unexpected (non-array) page; aborting without deleting.",
        ),
      );
    }
    yield page;
    try {
      next = nextLink(
        res.headers.get("link"),
        expected,
        new URL(next),
        expectedRepoId,
      );
    } catch {
      throw new Error(
        sanitize(
          token,
          "Repository scan returned an unsafe pagination URL; aborting without deleting.",
        ),
      );
    }
  }
}

/**
 * The asset filename a URL points at: its final path segment, percent-decoded.
 * GitHub builds browser_download_url by URL-encoding the asset's `name` into the
 * path, so the decoded segment equals `name` for a well-formed entry regardless
 * of whether the name held an encodable character (e.g. a space -> %20) — a raw
 * comparison would false-abort there. The URL is already canonical printable-
 * ASCII (isUsableAssetUrl ran first), so on a real asset URL the decode can't
 * fail; a defensive decode error returns "", which the listAssets name-binding
 * treats as a mismatch (abort, never delete).
 */
function urlFilename(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
  } catch {
    return "";
  }
}

/**
 * Decode percent-escapes in `s`, case-insensitively and with full UTF-8 support,
 * leaving anything that isn't a valid escape run untouched (a lone/short %, an
 * invalid byte sequence, a literal char). GitHub resolves an asset link by
 * decoding its path once, so folding a scanned body the same way makes encoding
 * variants of a link — `%5B`/`%5b`/`[`, or `%C3%A9`/`%c3%a9`/`é` — compare equal
 * to the decoded asset name (names aren't constrained to ASCII). Maximal escape
 * runs are decoded together so multi-byte sequences resolve; a run that isn't
 * valid UTF-8 is left as-is. Single level, mirroring GitHub's one-level path
 * decode; over-decoding only ever over-keeps an asset (fail-safe).
 */
function percentDecode(s: string): string {
  return s.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      return run;
    }
  });
}

/**
 * List every asset on the release (paginated). A malformed entry aborts (no
 * deletion): the id must be a positive safe integer, the name a non-empty
 * string, the browser_download_url must be a usable asset URL bound to THIS
 * repo+tag — the same check the upload path applies — AND the URL's filename (its
 * percent-decoded final segment) must equal `name`. Binding name to its URL
 * matters because both are match keys (a body may reference an asset by
 * filename): a stale/tampered page that paired one asset's id+URL with another's
 * name would otherwise let a filename-only reference be missed and the live asset
 * deleted. A name/URL mismatch is treated as malformed and aborts (fail-safe).
 */
async function listAssets(
  token: string,
  repo: Repo,
  relId: number,
  tag: string,
  fetchImpl: typeof fetch,
  repoId: number,
): Promise<Asset[]> {
  const assets: Asset[] = [];
  const url = `${API}/repos/${repoPath(repo)}/releases/${relId}/assets?per_page=100`;
  for await (const page of listPages(
    token,
    url,
    fetchImpl,
    "contents:read",
    repoId,
  )) {
    for (const item of page) {
      const a = item as {
        id?: unknown;
        name?: unknown;
        browser_download_url?: unknown;
      };
      if (
        typeof a.id !== "number" ||
        !Number.isSafeInteger(a.id) ||
        a.id <= 0 ||
        typeof a.name !== "string" ||
        a.name === "" ||
        !isUsableAssetUrl(a.browser_download_url, repo, tag) ||
        urlFilename(a.browser_download_url) !== a.name
      ) {
        throw new Error(
          sanitize(
            token,
            "A release asset entry was malformed; aborting without deleting.",
          ),
        );
      }
      assets.push({ id: a.id, name: a.name, url: a.browser_download_url });
    }
  }
  return assets;
}

/**
 * Scan the repo-local surfaces an agent could embed an asset URL into — issue
 * and PR bodies, their conversation comments, inline PR review comments, commit
 * comments, and release notes — calling `onText` with each non-empty body.
 * `onText` returns true once nothing is left to look for, which ends the scan
 * early. Fails closed on a malformed page item (a missing/non-string-non-null
 * body, or a non-object item): it aborts rather than treat the item as empty,
 * since a reference hidden in an unseen body would otherwise let a live asset be
 * deleted. Cannot cover PR review SUMMARY bodies (a per-PR N+1 endpoint), wikis,
 * other repo files, Discussions, or references from forks/other repos/off
 * GitHub — hence cleanup stays interactive and fail-safe.
 */
async function scanReferences(
  token: string,
  repo: Repo,
  fetchImpl: typeof fetch,
  onText: (text: string) => boolean,
  repoId: number,
): Promise<void> {
  const base = `${API}/repos/${repoPath(repo)}`;
  const sources: Array<{ url: string; scope: string }> = [
    { url: `${base}/issues?state=all&per_page=100`, scope: "issues:read" },
    { url: `${base}/issues/comments?per_page=100`, scope: "issues:read" },
    { url: `${base}/pulls/comments?per_page=100`, scope: "pull_requests:read" },
    { url: `${base}/comments?per_page=100`, scope: "contents:read" },
    { url: `${base}/releases?per_page=100`, scope: "contents:read" },
  ];
  for (const src of sources) {
    for await (const page of listPages(
      token,
      src.url,
      fetchImpl,
      src.scope,
      repoId,
    )) {
      for (const item of page) {
        // Fail closed on an unexpected item shape. A scanned item must be an
        // object whose `body` is a string (a blank body comes back as "" or
        // null) — GitHub sends the field, it never omits it. A missing body, a
        // non-string non-null value, or a non-object item means a malformed/
        // truncated page; treating it as empty could delete an asset whose only
        // reference lived in the unseen body, so abort before the delete loop
        // (the same rigor listAssets applies). null and "" are genuinely empty
        // items, skipped.
        const body =
          typeof item === "object" && item !== null
            ? (item as { body?: unknown }).body
            : undefined;
        if (body !== null && typeof body !== "string") {
          throw new Error(
            sanitize(
              token,
              "A scanned item was malformed (missing or non-string body); aborting without deleting.",
            ),
          );
        }
        // body is string | null here; null is empty (skip), non-empty strings scan.
        if (typeof body === "string" && body !== "" && onText(body)) return;
      }
    }
  }
}

/**
 * Re-fetch an asset by id and confirm it still hosts BOTH the URL and name we
 * matched, just before a destructive delete. The assets list pairs id with
 * browser_download_url, but a malformed/stale entry could pair our unreferenced
 * URL with a DIFFERENT asset's id — deleting by it would remove a live asset.
 * Mirrors uploadAsset's verifiedDelete: a non-200, unparseable body, or a URL/
 * name that no longer matches means skip (never delete by an id we can't
 * re-confirm). Checking the name too — not just the URL — re-binds both fields at
 * the destructive step even if the re-fetch response is itself inconsistent.
 */
async function idStillHostsUrl(
  token: string,
  repo: Repo,
  asset: Asset,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  let res: Response;
  try {
    res = await authedFetch(
      token,
      `${API}/repos/${repoPath(repo)}/releases/assets/${asset.id}`,
      {},
      fetchImpl,
    );
  } catch {
    return false;
  }
  if (res.status !== 200) return false;
  const got = (await res.json().catch(() => null)) as {
    browser_download_url?: unknown;
    name?: unknown;
  } | null;
  return got?.browser_download_url === asset.url && got?.name === asset.name;
}

const SCOPE_NOTE =
  "\n⚠ This scan covers issue/PR bodies, their comments (including inline review\n" +
  "  comments), commit comments, and release notes only — NOT PR review summary\n" +
  "  bodies, wikis, README or other repo files, Discussions, or references from\n" +
  "  forks, other repos, or off GitHub. Review the list before confirming.\n";

/**
 * The target repository's numeric id, fetched once up front. GitHub returns
 * pagination links in the `/repositories/{id}` form, so the scan must know THIS
 * repo's id to re-bind those links (nextLink) and reject a jump to another
 * repo's id. Fails closed: if the id can't be resolved to a positive safe
 * integer, abort before the destructive phase rather than scan unverifiable
 * pages.
 */
async function repoNumericId(
  token: string,
  repo: Repo,
  fetchImpl: typeof fetch,
): Promise<number> {
  const res = await authedFetch(
    token,
    `${API}/repos/${repoPath(repo)}`,
    {},
    fetchImpl,
  );
  if (res.status !== 200) {
    throw await apiError(token, res, "Look up repository", "metadata:read");
  }
  const got = (await res.json().catch(() => null)) as { id?: unknown } | null;
  if (
    typeof got?.id !== "number" ||
    !Number.isSafeInteger(got.id) ||
    got.id <= 0
  ) {
    throw new Error(
      sanitize(
        token,
        "Could not resolve the repository id; aborting without deleting.",
      ),
    );
  }
  return got.id;
}

/**
 * Interactively delete assets on the `tag` release that no scanned surface
 * references. Fail-safe by construction: any scan/listing error aborts before
 * deleting anything (better an orphan than a deleted live image), the
 * destructive step is refused without a TTY (no piped "y" — there is no --yes),
 * and the scope of the scan is shown at the point of decision.
 */
export async function cleanup(
  token: string,
  repo: Repo,
  tag: string,
  deps: CleanupDeps = {},
): Promise<void> {
  const { fetchImpl, warn, isTTY, confirm } = depsOf(deps);
  const say = (m: string) => warn(sanitize(token, m));

  // The tag goes into the request path (and is published in asset URLs); a token
  // can't be redacted from an identifier, so refuse a token-bearing --tag before
  // any network call, exactly as the upload path does.
  if (tag.includes(token)) {
    throw new Error(
      sanitize(
        token,
        "Refusing to use a --tag that contains the GitHub token.",
      ),
    );
  }

  const relRes = await authedFetch(
    token,
    `${API}/repos/${repoPath(repo)}/releases/tags/${encodeURIComponent(tag)}`,
    {},
    fetchImpl,
  );
  if (relRes.status === 404) {
    say(
      `No "${tag}" release on ${repo.owner}/${repo.name} — nothing to clean up.\n`,
    );
    return;
  }
  if (relRes.status !== 200) {
    throw await apiError(token, relRes, "Look up release", "contents:read");
  }
  // Validate exactly as the upload path does (reusing releaseId): the response
  // must be for THIS tag and a non-draft prerelease with a usable id, so
  // --cleanup never deletes assets from a real published release that happens to
  // use an underscore tag — uploads would refuse it too.
  const relId = await releaseId(token, relRes, "Look up release", tag);

  // Resolve THIS repo's numeric id once: GitHub's pagination links use the
  // /repositories/{id} form, and the scan re-binds them to this id (nextLink).
  const repoId = await repoNumericId(token, repo, fetchImpl);

  const assets = await listAssets(token, repo, relId, tag, fetchImpl, repoId);
  if (assets.length === 0) {
    say(`The "${tag}" release has no assets — nothing to clean up.\n`);
    return;
  }

  say(
    "Scanning issues, PRs, comments, and release notes for referenced images...\n",
  );
  // Start with every asset a deletion candidate; drop any whose URL or name
  // appears in a scanned body. Match each body in several folded forms so an
  // equivalent-but-not-identical reference still counts (a match keeps the asset
  // — fail toward keeping): raw, as GitHub renders it (decoding entities /
  // dropping backslash escapes — `shot&#45;hex.png`, `shot\-hex.png`), and each
  // of those percent-decoded (so `%5B`/`%5b`/`[` and `%C3%A9`/`%c3%a9`/`é` fold
  // together). The decoded forms catch references by the decoded name; the raw/
  // rendered forms catch the canonical URL. Missing any would delete a live image.
  const candidates = new Map<number, Asset>(assets.map((a) => [a.id, a]));
  await scanReferences(
    token,
    repo,
    fetchImpl,
    (text) => {
      const rendered = renderInlineMarkdown(text);
      const haystacks = [
        text,
        rendered,
        percentDecode(text),
        percentDecode(rendered),
      ];
      for (const [id, a] of candidates) {
        if (haystacks.some((h) => h.includes(a.url) || h.includes(a.name))) {
          candidates.delete(id);
        }
      }
      return candidates.size === 0;
    },
    repoId,
  );

  // Assets no scanned body matched. Split off any with a NON-ASCII name and keep
  // them: such a name can be referenced via a named HTML entity (caf&eacute;.png)
  // that renderInlineMarkdown doesn't decode — we decode numeric, percent, and
  // ASCII-named forms, but not the full ~2000-entry named table — so a
  // named-entity reference would be missed and a live image deleted. Failing
  // toward keeping closes that whole class without embedding the table; their
  // URL/numeric/percent/literal references are still matched, only the named form
  // on the name is unsure, and the count is reported for manual review.
  const remaining = [...candidates.values()];
  const isNonAscii = (s: string) =>
    [...s].some((ch) => (ch.codePointAt(0) ?? 0) > 0x7f);
  const kept = remaining.filter((a) => isNonAscii(a.name));
  const unreferenced = remaining.filter((a) => !isNonAscii(a.name));
  const referenced = assets.length - remaining.length;
  say(
    `Found ${assets.length} asset(s); ${referenced} referenced, ${unreferenced.length} unreferenced` +
      (kept.length
        ? `, ${kept.length} kept (non-ASCII name — verify manually).`
        : ".") +
      "\n",
  );
  if (kept.length > 0) {
    say(
      "⚠ Not deleting these non-ASCII-named asset(s) — a named-entity reference to\n" +
        "  them can't be matched reliably. Delete manually if truly unused:\n",
    );
    for (const a of kept) say(`  - ${redactField(a.name, token)}\n`);
  }
  if (unreferenced.length === 0) {
    say("Nothing to delete.\n");
    return;
  }
  say(SCOPE_NOTE);
  // a.name is response-derived; redactField strips an encoded token and collapses
  // control chars (log forging) — sanitize() in say() catches only the literal.
  for (const a of unreferenced) say(`  - ${redactField(a.name, token)}\n`);

  if (!isTTY) {
    throw new Error(
      sanitize(
        token,
        "Refusing to delete without interactive confirmation (stdin is not a TTY). " +
          "Re-run in a terminal to confirm, or remove the assets listed above with " +
          "`gh release delete-asset <tag> <asset-name>`. Do NOT use `gh release " +
          "delete` — that deletes the whole release and every still-referenced image.",
      ),
    );
  }
  const ok = await confirm(
    `\nDelete ${unreferenced.length} unreferenced asset(s)? [y/N] `,
  );
  if (!ok) {
    say("Aborted; nothing deleted.\n");
    return;
  }

  let deleted = 0;
  for (const a of unreferenced) {
    // Re-confirm the id still hosts the URL we judged unreferenced before the
    // destructive delete — a mismatched/stale list entry must not delete a live
    // asset by an id we matched to a different URL.
    if (!(await idStillHostsUrl(token, repo, a, fetchImpl))) {
      say(
        `  skipped ${redactField(a.name, token)} (id no longer matches; re-run --cleanup)\n`,
      );
      continue;
    }
    await deleteAsset(token, repo, a.id, { fetchImpl });
    deleted += 1;
    say(`  deleted ${redactField(a.name, token)}\n`);
  }
  say(`Deleted ${deleted} asset(s).\n`);
}
