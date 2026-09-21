# Collapse control chars in release.ts error-path messages

Closes the "Scoped out" item from
`devlog/2026-06-26-1114-strip-del-c1-controls.md`: that note collapsed
C0/DEL/C1/LS/PS control characters in a filename on the SUCCESS-path stderr
surfaces only (`UploadResult.filename`, the no-digest warning), and explicitly
left every ERROR-path echo of `file.filename` uncollapsed as a follow-up.
`sanitize()` strips the token on those same paths but never touched control
characters, so a crafted filename containing a CSI (U+009B) or similar control
sequence could still forge stderr/CI log lines whenever an error was thrown.

## Fix

`uploadAsset` already computed `displayFilename` (token-redacted,
`collapseControls`-collapsed) once via `guardFilename`. Routed it into every
downstream call that previously received the raw `file.filename`:

- `readValidatedFile` gained a new `displayFilename` parameter (it previously
  took only `(token, file)`), used in the "Cannot read" message and all three
  "changed after validation" variants (stat-size, post-read-size,
  digest-mismatch-with-no-size).
- `postAssetUpload`, `bindResponseUrl`, `rejectInvalidAssetShape` already took
  a `filename`-shaped parameter; only their call-site arguments changed
  (`file.filename` → `displayFilename`), no signature change.
- `verifyIntegrity` had TWO filename-shaped parameters (a raw `filename` used
  for the size-mismatch/integrity-failed throws and their `verifiedDelete`
  `context` strings, plus the already-correct `displayFilename` used only for
  the no-digest warn). Deleted the redundant raw `filename` parameter entirely
  and pointed every interpolation and context string at `displayFilename`.

None of these five functions are exported or used outside `uploadAsset`
(confirmed by grep before editing), so every signature change is
internal-only. `sanitize(token, ...)` wrapping at each throw site is
unchanged — it still does its (token-only) job; this fix is orthogonal
(control-character collapsing, not token redaction).

## Sites fixed (all src/release.ts)

1. `readValidatedFile` — "Cannot read", stat-size mismatch, post-read-size
   mismatch, digest-mismatch-no-size (3 throw sites, one function).
2. `postAssetUpload` — the `apiError(token, res, "Upload ${filename}")`
   context on a non-201, and the "missing asset id" throw.
3. `bindResponseUrl` — the unusable-URL `warn(...)` and its paired throw.
4. `rejectInvalidAssetShape` — the content-type-mismatch and non-uploaded-state
   throws, and the `mime-mismatch ${filename}` / `bad-state ${filename}`
   context strings passed into `verifiedDelete`'s orphan-warn message.
5. `verifyIntegrity` — the size-mismatch and integrity-failed throws, and
   their `size-mismatch ${filename}` / `integrity-failed ${filename}` context
   strings into `verifiedDelete`.

## Refute-first pass (credential-leak-surface-class change per AGENTS.md)

Ran an independent adversarial review (fresh-context subagent, prompted to
refute rather than confirm) against the diff. Checked and confirmed:

- **No remaining raw echo.** `grep -n "file\.filename" src/release.ts`
  post-fix returns exactly one hit: the `guardFilename(token, file.filename)`
  call in `uploadAsset` that *mints* `displayFilename` in the first place —
  every downstream message site is clear.
- **`verifyIntegrity`'s signature change didn't drop a use.** All four
  interpolations/context-strings inside the function (`size-mismatch`,
  the size-mismatch throw text, `integrity-failed`, the integrity-failed throw
  text) now read `displayFilename`; none silently reverted to the deleted
  `filename` param (would have been a compile error anyway — confirmed
  `tsc --noEmit` clean).
- **No other exported/internal function outside `release.ts` embeds a raw
  filename in a message.** Checked `index.ts`, `output.ts`, `github.ts`,
  `cleanup.ts`: `index.ts`'s "✓ Uploaded …" line and `output.ts`'s alt text
  both already consume the collapsed `result.filename` / go through
  `escapeAltText` (which calls `collapseControls`) — unchanged by this fix,
  confirming the non-goal that scoped this change to `release.ts` only.
- **New tests exercise the claimed branch, not a fallback.** Spot-checked the
  "Cannot read" test (file absent → `statSync` throws before any fetch;
  `calls.length === 0` confirms no request was made) and the
  unusable-asset-url test (empty `browser_download_url` on a 201 triggers
  `bindResponseUrl`'s warn+throw specifically, not `rejectInvalidAssetShape`
  or `verifyIntegrity`, which never run).
- **No regression on clean-ASCII filenames.** `collapseControls` is a no-op on
  printable ASCII, so pre-existing tests (`Cannot read shot.png` style
  assertions, the mismatched-content_type/state loop) needed no changes and
  still pass.

No findings surfaced; nothing to accept or reject.

## Verification

`npm test` (212 tests, up from 202 — 10 new regression tests, one per throw
site plus the two-site content_type/state loop and the bonus no-digest
size-mismatch case), `npm run lint`, `npm run format`, `npm run build`, and
`npm run typecheck` all clean.

Revisit when: a sixth error-path filename echo is found in `release.ts` that
this pass missed (grep coverage was exhaustive at time of writing, but a
future refactor could reintroduce one), or when `collapseControls`'s covered
character set itself needs to change (a distinct, broader finding — see the
2026-06-26 note's own scope boundary).
