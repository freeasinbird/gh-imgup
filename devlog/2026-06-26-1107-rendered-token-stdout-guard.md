# Rendered-token stdout guard (review P2)

Branch `fix/rendered-token-stdout-guard`. Third of the 6-finding review batch.
The upload path guarded the token in literal / `%XX` / `\uXXXX` forms
(`decodesToToken`) but not in a *rendered* Markdown form. `apierr.ts`
deliberately doesn't decode HTML entities (invariant 3), so a name like
`ghp&lowbar;TOK.png` (`&lowbar;` -> `_`) slipped both the filename guard
(release.ts ~392) and the response-URL guard (~505), then rendered to the token
on upload-only stdout (Markdown alt text / the `![]()` destination). The public
comment path already refuses rendered forms (github.ts via `renderInlineMarkdown`)
— this extends that same refusal to the upload surface.

## Fix

Import `renderInlineMarkdown` into release.ts and add it to both guards:
- filename: reject if `decodesToToken(renderInlineMarkdown(displayName), token)`
  — before any file read, so the token can't survive into a read error.
- response URL: reject (warn + "unusable asset URL") if
  `decodesToToken(renderInlineMarkdown(downloadUrl), token)`.

## Refute-first (credential-leak + returned-object-trust boundary)

- **Is the URL guard reachable, or dead code?** Reachable. `isUsableAssetUrl`
  keeps `&`/`;` (sub-delims, printable ASCII, not URL-normalized so `href ===
  value` holds), so a tampered 201 `.../ghp&lowbar;TOK-{ourHex}.png` passes
  isUsableAssetUrl + the hex bind + `decodesToToken` and is caught ONLY by the
  new rendered check. Confirmed by a test that constructs exactly that URL.
- **Do the tests actually detect the regression?** Empirically yes: with the two
  new conditions removed and rebuilt, both new tests FAIL (filename → read error
  not "encodes the token"; URL → reaches digest verify, "unexpected GET"); with
  them, both pass. The guards are load-bearing, not redundant.
- **Over-refusal risk?** `renderInlineMarkdown` over-decoding only ever over-
  refuses an upload (fail-safe, invariant 3 direction); a benign non-ASCII /
  entity-free name is unaffected. Accepted.
- **Error message leak?** Both reject with constant messages (no filename/URL
  interpolation); tests assert `doesNotMatch /ghp_tok/i`.

## Verification

- New tests (release 40 → 42; total 164 → 166): rendered-form filename rejected
  pre-read; rendered-form response URL rejected as unusable (no DELETE, --cleanup
  warned). Refute-first empirical check above.
- `npm test` 166/166, `npm run lint`, `typecheck`, `format` clean.

## Remaining review findings (separate PRs)

P2 DEL/C1 filename controls; P2 npm pack build hook; P3 stale design.md.
