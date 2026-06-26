# Strip DEL/C1 control chars from output (review P2)

Branch `fix/strip-del-c1-controls`. Fourth of the 6-finding review batch.
`escapeAltText` collapsed only C0 (U+0000–U+001F) + LS/PS, leaving DEL (U+007F)
and the C1 block (U+0080–U+009F, incl. CSI U+009B — a terminal-escape
introducer). A control char in a filename could reach the four success output
surfaces: Markdown stdout, the `--json` `markdown` AND `filename` fields, the
stderr `✓ Uploaded …` progress, and a comment body. JSON doesn't save us:
`JSON.stringify` escapes only C0, emitting DEL/C1 raw. `validateImageFile`
doesn't strip them either (extension + size only).

## Fix

`markdown.ts`: new `collapseControls(s)` — collapses maximal runs of C0/DEL/C1 +
LS/PS to a single space, authored as a `codePointAt` scan (NOT an escape-range
regex; AGENTS.md flags control-char character classes as edit-tooling-unsafe, and
the existing inline regex carried literal `\u…` text that the edit tool wouldn't
match — rewrote the function via a node script). `escapeAltText` now delegates to
it (covers Markdown stdout / JSON `markdown` / comment body). `release.ts`:
`result.filename = collapseControls(displayName)` at the source (covers JSON
`filename` + stderr progress, which echo it verbatim). The asset name sent to
GitHub is unchanged and already safe (encodeURIComponent in the upload URL).

## Refute-first (output-contract security surface)

- **Set completeness** — collapses exactly invariant 3's named set (C0/DEL/C1 +
  line/paragraph). Bidi overrides / BOM are out of that set and out of scope.
- **Legit filenames** — printable ASCII and normal Unicode untouched (tested
  `café`, `shot-1a2b3c4d.png`); only control chars change. 
- **Binding** — `result.filename` is display-only; the asset-name/URL binding
  uses the hex via `safeFilename(displayName)` independently, so collapsing the
  returned label can't affect upload integrity.
- **Empirical** — `escapeAltText` collapses DEL/CSI/NEL; `uploadAsset` returns
  `"shot x.png"` for a CSI-bearing name (end-to-end through the real upload).

## Review fix (Codex P2, PR #25)

The no-digest **success** warning (`⚠ Server returned no digest for …`) still
interpolated the RAW `file.filename`, so on a successful upload where the server
omits `digest`, a DEL/C1 reached stderr — a success-path surface I'd missed (it's
not one of the error paths scoped out below). Confirmed real. Fixed by computing
`displayFilename = collapseControls(displayName)` once and using it for BOTH the
returned filename and that warning. Folded into the collapse commit; new test
asserts the warn shows the collapsed name on the no-digest path.

## Scoped out (observed, not fixed)

True ERROR-path echoes of the RAW `file.filename` (e.g. `Cannot read …`, the
`apiError` "Upload …" prefix — all of which throw) still pass control chars to
stderr — `sanitize()` strips the token but not control chars. The finding scoped
to the four success surfaces; widening error-path echoes to collapse controls is
a separate change. Not promoting to AGENTS.md yet — left here for a follow-up.

## Verification

- New/extended tests: `escapeAltText` + `collapseControls` cover DEL/C1/CSI/NEL
  and run-collapsing; `uploadAsset` returns a collapsed `filename` (total 164 →
  166). `npm test` 166/166, `npm run lint`, `typecheck`, `format` clean.
- markdown.ts byte-audited (cat -v): no literal control bytes introduced.

## Remaining review findings (separate PRs)

P2 npm pack build hook; P3 stale design.md (help/wrapper).
