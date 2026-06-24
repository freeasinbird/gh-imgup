# release.ts: hardening pass against malformed/tampered API responses

Consolidates the hardening that followed the initial pipeline
([[2026-06-23-2115-release-asset-pipeline]]): one proactive multi-lens sweep
plus a long run of Codex review rounds, all on `release.ts` + its tests. The
round-by-round devlog entries were collapsed into this one when the PR history
was squashed; the per-round reasoning lives in the PR's review threads. What
follows is the surviving decision set, by theme.

## Validate returned-object *semantics*, not just shape

- `releaseId` requires `Number.isSafeInteger(id) && id > 0`, `tag_name === tag`
  (case-sensitive), `prerelease === true`, and `draft === false` — each field
  must be explicitly valid, so a malformed/intermediary 2xx (HTML 200, wrong
  tag, non-boolean/absent `prerelease`/`draft`) fails closed rather than
  becoming the image bucket. A published or draft release colliding on the tag
  is refused with guidance (a draft's asset URLs 404 by tag).
- `res.json()` on every 2xx branch is parsed defensively (no contextless
  `SyntaxError`/`TypeError`); the 422 path reads the body once as text so a
  non-JSON 422 keeps its detail.

## Bind the success response to *our* upload

- `isUsableAssetUrl(value, repo, tag)`: printable-ASCII-only, parseable, https,
  `github.com`, no userinfo/port/query/fragment, canonical (`url.href === value`),
  and path exactly `/{owner}/{repo}/releases/download/{tag}/{asset}` — owner/repo
  case-insensitive (GitHub is; the casing regression below), tag exact.
- The URL alone doesn't prove it's *ours*: also require the last segment to carry
  our per-upload random hex. Chosen over exact-name match deliberately, so
  GitHub's own stem sanitization doesn't false-reject a real upload.
- `content_type`/`state`/`size` mismatches fail closed (post-binding, so the id
  is safe to clean up). Integrity: verify SHA-256; absent digest → warn (+size
  check); present-but-malformed/empty digest → fail closed. TOCTOU on the local
  file is guarded twice: a `statSync` BEFORE the read rejects a replaced/grown
  file so `readFileSync` never pulls a now-huge file into memory (bounding
  memory despite `--max-size`), and a post-read `bytes.length` check backstops
  the tiny stat→read window before hashing/uploading unvalidated bytes.

## The token never leaks — literal *or* encoded, on any surface

- `sanitize` only strips the literal token, so encoded forms get their own
  defenses: `decodesToToken` decodes both `%XX` (URL/percent) and JS/JSON
  `\uXXXX` escapes to a fixed point (no depth cap; tolerant of malformed
  escapes) and is used to reject token-encoding filenames and returned URLs, and
  to wholesale-`[REDACTED]` any response field (`redactField`), error body
  (`redactBody`), or response status text (`redactField` on `res.statusText`)
  that decodes to the token. The `\uXXXX` form matters for `apiError`, which
  redacts the RAW JSON error text (`res.text()`, not parsed): a body that
  JSON-escapes the token's underscore keeps the literal token out of the raw
  text entirely, so a percent-only decoder would miss it and print a trivially
  decodable form. Every response-controlled value echoed into an error now gets
  decode-aware redaction, not just the literal `sanitize`.
- The asset name and returned filename are redacted (they reach PUBLIC surfaces —
  the comment/URL — which is worse than stderr). Read failures echo `err.code`,
  never `err.message` (it embeds the filepath, where a directory could encode the
  token).

## Cleanup is safe-by-construction

- A failed cleanup delete never masks the integrity error (`bestEffortDelete`
  warns; the real error is always thrown) and flags the possible orphan.
- Never delete by an id we can't confirm is ours. The 201's URL binds to our
  upload (repo/tag/hex), but `asset.id` is a SEPARATE field — a malformed body
  could pair our URL with another asset's id. So every cleanup goes through
  `verifiedDelete`: re-fetch the asset by id from a trusted GET and delete only
  if THAT id hosts our upload (its URL passes the same binding); otherwise warn
  about an orphan (`--cleanup`). The extra GET runs only on the rare failure
  path. Assessment: the realistic data-loss risk is low (forging a hex-bound URL
  needs our hex, which lives only in the encrypted request ⇒ a MITM who already
  holds the token and can delete directly), but the guard is cheap on the happy
  path, preserves invariant 6's delete-on-mismatch, and makes "never delete an
  unverified id" airtight, so we added it rather than leaving the gap documented.

## Deferred to index.ts (tracked)

- **Bind the upload to validated/reviewed content, not just size.** The pre-read
  `statSync` + length check guards size changes, but a *same-length* content swap
  between `validateImageFile` and `uploadAsset` passes, and the SHA-256 is then
  computed from the replacement — so the integrity check (server == uploaded)
  succeeds for content that was never validated or seen by the SKILL review. The
  fix is a validation-time fingerprint: `validateImageFile` stream-hashes each
  file into `ImageFile.sha256`, and `uploadAsset` rejects when its already-
  computed `localDigest` differs (~1 line on the upload side). It's deferred,
  not declined: the fingerprint must originate in `validate.ts`, the
  validate→upload seam is assembled in `index.ts`, and the TOCTOU can't manifest
  until `uploadAsset` is wired there — so there is no live exposure to close in
  this release-scoped PR. Do it when wiring `index.ts`.

## Lessons (carry into github.ts / index.ts)

- The casing regression: tightening the same-repo check to exact `===` was
  over-strict and false-rejected (and orphaned) legit uploads. Case-fold what
  GitHub case-folds; exact-match what it doesn't (tags).
- A proactive sweep reduces but never eliminates misses — it cleared the
  prerelease-semantics and sanitize-ordering gaps that Codex then caught. Build
  review lenses that check returned-object semantics, output sanitization of
  *user input* (not just response values), and parse-based (not prefix) URL
  checks. "The SKILL/agent layer covers it" is not a substitute for the tool's
  own structural guarantee.
