import { execFileSync } from "node:child_process";

/** A resolved GitHub token and where it came from. */
export interface TokenResolution {
  token: string;
  /** `env` = GITHUB_TOKEN; `gh` = the gh CLI fallback (broad scope, warned). */
  source: "env" | "gh";
}

/**
 * Stderr warning emitted once when the token came from the gh CLI fallback. The
 * gh token is typically a broad-scope OAuth token, not a repo-scoped PAT.
 */
export const BROAD_SCOPE_WARNING =
  "⚠ Using gh CLI token (broad scope). For tighter security, set GITHUB_TOKEN to a fine-grained PAT.\n";

/**
 * Read the gh CLI's stored token, or null if gh is absent (ENOENT) or not
 * logged in (non-zero exit). One of the tool's exactly two subprocess calls:
 * array args (no shell, no user input), 5s timeout, stderr discarded so gh's own
 * messages never reach our output.
 */
function ghToken(): string | null {
  try {
    const out = execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const trimmed = out.trim();
    return trimmed === "" ? null : trimmed;
  } catch {
    return null;
  }
}

/** Injectable dependencies for {@link resolveToken} (real defaults in production). */
export interface ResolveTokenDeps {
  env?: NodeJS.ProcessEnv;
  readGhToken?: () => string | null;
}

/**
 * Resolve a GitHub token: GITHUB_TOKEN env first, then the gh CLI's stored token.
 * Both sources are trimmed and empty/whitespace is treated as absent. Throws with
 * actionable guidance if neither is available — never falls back to anything else.
 */
export function resolveToken(deps: ResolveTokenDeps = {}): TokenResolution {
  const env = deps.env ?? process.env;
  const readGhToken = deps.readGhToken ?? ghToken;

  const envToken = (env.GITHUB_TOKEN ?? "").trim();
  if (envToken !== "") {
    return { token: envToken, source: "env" };
  }

  const gh = readGhToken();
  if (gh !== null && gh.trim() !== "") {
    return { token: gh.trim(), source: "gh" };
  }

  throw new Error(
    "No GitHub token found. Set GITHUB_TOKEN (export GITHUB_TOKEN=$(gh auth token)),\n" +
      "run `gh auth login`, or create a fine-grained PAT at https://github.com/settings/tokens.\n" +
      "A token with contents:write is required (add issues:write for --pr/--issue).",
  );
}

/**
 * Strip the token from an error message so it never reaches stderr, CI logs, or
 * agent context (invariant 3). Covers `Bearer <token>` too, since the bare token
 * is a substring. The single primitive every API error path funnels through.
 */
export function sanitize(token: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return token ? msg.replaceAll(token, "[REDACTED]") : msg;
}

/** GitHub API hosts the tool will ever contact. No third-party destinations. */
const GITHUB_API_HOSTS = new Set(["api.github.com", "uploads.github.com"]);

/**
 * `fetch()` for the GitHub API: requires HTTPS and enforces the two-host
 * allowlist (invariant 4) before the bearer token is ever attached, adds the
 * auth, Accept, and API-version headers, and sanitizes the token out of any
 * thrown network error (invariant 3) before it propagates. Returns the raw
 * Response — callers inspect `.status` themselves, sanitizing non-ok error
 * messages with {@link sanitize}, since which statuses are errors is per-endpoint
 * (e.g. a 404 on get-release-by-tag is expected, not a failure).
 *
 * `fetchImpl` is injectable for tests; production uses the global `fetch`.
 */
export async function authedFetch(
  token: string,
  url: string,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const parsed = new URL(url);
  // HTTPS-only: the token must never go out over plaintext, even to an allowed
  // host that would redirect to HTTPS — the cleartext request leaks it first.
  if (parsed.protocol !== "https:") {
    throw new Error(`Refusing to send credentials over non-HTTPS URL: ${url}`);
  }
  if (!GITHUB_API_HOSTS.has(parsed.host)) {
    throw new Error(`Refusing to contact non-GitHub host in URL: ${url}`);
  }
  try {
    // Header construction is inside the sanitized try: a token with an invalid
    // header character (e.g. an embedded CR/LF) makes Headers.set throw a
    // TypeError that echoes the value, so it must be redacted like any other
    // error rather than propagating raw. Normalizing init.headers via the
    // Headers ctor also preserves any HeadersInit form (object, Headers, tuple
    // array) so a caller's header (e.g. the upload's Content-Type) isn't
    // dropped; Authorization is always ours — a caller cannot override it.
    const headers = new Headers(init.headers);
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/vnd.github+json");
    }
    if (!headers.has("X-GitHub-Api-Version")) {
      headers.set("X-GitHub-Api-Version", "2022-11-28");
    }
    headers.set("Authorization", `Bearer ${token}`);
    // Fail loud on any 3xx rather than silently following it: the host/HTTPS
    // checks only ran on the initial URL, and none of our operations need a
    // client-followed redirect, so an off-allowlist Location would otherwise
    // escape invariant 4. Forced after the spread so a caller can't re-enable
    // auto-follow; a 3xx now rejects into the sanitizing catch.
    return await fetchImpl(url, { ...init, headers, redirect: "error" });
  } catch (err) {
    throw new Error(sanitize(token, err));
  }
}
