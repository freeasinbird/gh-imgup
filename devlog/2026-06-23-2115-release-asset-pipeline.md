# release.ts: create-or-get release + upload + integrity

Third build stage — the core upload pipeline, on top of the auth chokepoint.

## Decisions

- **`ensureRelease` is race-safe create-or-get**: GET by tag → 404 → POST
  create (prerelease:true, the do-not-delete name/body) → on 422 whose body has
  an `already_exists` error (a concurrent run won), retry the GET; any other 422
  is a real error. Matches the API-verified 422 shape.
- **`uploadAsset` verifies integrity**: read bytes, local SHA-256, POST to
  uploads.github.com with the file's Content-Type, then compare the API `digest`
  (case-insensitive, `sha256:` stripped). Mismatch → delete the asset and throw;
  absent digest → warn (server may omit it), don't silently pass.
- **The rendered URL is the API's `browser_download_url`, not constructed.**
  safeFilename (`{stem}-{8hex}{.ext}`, hex from randomUUID) only names the upload
  request; whatever GitHub does to the asset name, we return its URL — robust to
  GitHub's own name sanitization.
- **`apiError` is the sanitized non-ok path**: strips the token (via auth's
  sanitize), truncates the body, and on 401/403 appends an operation-attributed
  scope hint (`contents:write`) — the honest diagnostic, since the API doesn't
  make the missing permission derivable from the response.
- **Same DI test seam as auth** (`ReleaseDeps{fetchImpl, warn}`): tests script a
  fake transport *through the real authedFetch* and use temp files for real
  SHA-256. encodeURIComponent on path segments is belt-and-suspenders over the
  validators.

## Gotcha (recorded)

`sanitize` redacts the whole token string, so a degenerate 1-char token ("t" in
an early test draft) over-redacts every "t" in a message. Harmless in production
(GitHub tokens are long/unique) and fail-safe; tests now use a realistic token.

## Deferred

- Wiring into index.ts (next stage): resolveToken → emit broad-scope warning →
  validate all files up front → ensureRelease once → uploadAsset loop (fail-fast,
  leave uploads per the owner decision) → comment.
- The issues:write scope hint belongs to github.ts (comments).
