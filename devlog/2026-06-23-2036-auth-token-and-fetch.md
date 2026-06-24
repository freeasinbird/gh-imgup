# auth.ts: token resolution + sanitized GitHub fetch

Second build stage. Establishes the auth/error-sanitization boundary the
network modules (release/github/cleanup) will sit behind.

## Decisions

- **Dependency injection is the test seam** (settles the question the readiness
  review deferred). `resolveToken({env, readGhToken})` and
  `authedFetch(..., fetchImpl)` take their I/O as injectable params with real
  defaults (`process.env`, the gh subprocess, global `fetch`). Chosen over
  `node:test` module-mocking because ESM named imports are read-only bindings
  that don't mock cleanly; DI keeps the units pure and the I/O at the boundary.
- **`resolveToken`**: GITHUB_TOKEN → gh fallback → throw with guidance. Both
  sources trimmed; empty/whitespace = absent. Returns `{token, source}` and does
  NO warning I/O itself — the caller emits `BROAD_SCOPE_WARNING` once when
  `source === "gh"`, keeping resolution side-effect-light.
- **`authedFetch` is the single network chokepoint**, making two invariants
  structural: host allowlist (invariant 4: only api/uploads.github.com — checked
  via `new URL(url).host`, which defeats userinfo spoofs) and token redaction
  (invariant 3: `sanitize()` strips the token from any network throw). It returns
  the raw Response; callers own non-ok handling and use `sanitize()` for those
  messages, since which statuses are errors is per-endpoint (404 on
  get-release-by-tag is expected, not a failure).
- `ghToken()` is the first of the tool's two subprocess calls: `execFileSync`
  array args, 5s timeout, stderr discarded so gh's own messages never leak.

## Deferred

- Wiring resolveToken/authedFetch + the warning emission into index/release —
  later stages. The warning text lives in auth; the *emission* is the caller's.

## Promote to AGENTS.md (follow-up)

The DI test-seam pattern (inject env/exec/fetch; production defaults) is now the
project's convention for testing I/O modules with zero deps — worth a line under
"Build, test, run".
