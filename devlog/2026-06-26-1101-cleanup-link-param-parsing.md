# Cleanup Link-param parsing (review P1/P2)

Branch `fix/cleanup-link-param-parsing`. Second of the 6-finding review batch.
The `--cleanup` pagination follower recognized only `<url>; rel="next"` with
`rel` immediately after the target (positional regex). A valid RFC 8288 header
that places another param first — e.g. `<…>; type="application/json"; rel="next"`
— was read as "no next page", silently truncating the scan; a reference living
only on the dropped page would let cleanup delete a live asset after the confirm.
Reproduced by the reviewer with a fake API; mirrored in tests.

## Fix

Replaced the positional regex with a structured RFC 8288 parser
(`parseLinkHeader`): a character scan that respects `<…>` targets and quoted
param values (so a comma/semicolon inside either isn't a delimiter) and finds
`rel` wherever it sits among the params (relation tokens lowercased,
space-separated, multi-value). `rawNextLink` returns the `next` URI, null when
there's genuinely no next page (legitimate last page: prev/first/last, no next),
and **throws on a malformed header** (no parseable link-value, unterminated `<`
or quote, missing comma) — `listPages` already turns a throw into a fail-closed
abort before any delete. The downstream `nextLink` binding (host/repo/endpoint/
query/contiguous-page) is unchanged; broadening recognition can't bypass it.

## Refute-first (destructive path)

- **Could broader recognition follow an off-repo link?** No — every followed
  link still passes the full `nextLink` binding; the parser only supplies the
  URI string. Confirmed: binding untouched.
- **Does a legitimate last page now throw?** No — prev/first/last headers are
  well-formed, parse to links with no `next`, return null. Tested.
- **Availability: could a real GitHub header now be rejected?** Only a
  structurally malformed one, which GitHub doesn't emit; and abort-not-delete is
  the safe direction. Accepted-by-decision.
- **Termination / pathological input** (`;;`, empty names, comma-in-URI,
  trailing junk): each advances `i` or fails closed; no infinite loop. Covered
  by reasoning + the malformed-header test set.
- **Duplicate `rel` in one link-value** (Codex P2, PR #23). RFC 8288 keeps the
  FIRST `rel`; the parser took the last, so `rel="next"; rel="last"` would read
  as no-next and skip a page (delete-a-live-asset). Confirmed real. Fixed by
  failing closed on a duplicate `rel` (throw → abort) rather than picking
  first/last — consistent with the parser's fail-closed-on-anomaly stance and
  strictly safe on the destructive path; GitHub never emits duplicate `rel`.
  Folded into the parser commit; covered by the malformed-header test set.
- **Empty / valueless `rel`** (Codex P2, PR #23 re-review). `; rel`, `; rel=`,
  `; rel=""` left the parsed rel `[]`, so `rawNextLink` returned null and the
  scan treated the page as the last — could skip a page (delete-a-live-asset).
  `rel` is required non-empty, so fail closed here too (throw on empty rel).
  Same fold; added to the malformed-header test set.

## Promoted

Drained the open promote note from [[2026-06-25-1114-cleanup-pagination-binding]]
(invariant 4 mentioned only the host allowlist for rel=next). Invariant 4 now
states the full `--cleanup` pagination binding AND the new fail-closed-on-
unparseable-Link property. Promote queue for cleanup pagination is now empty.

## Verification

- New tests (cleanup 35 → 39; total 164 → 168): `rawNextLink` param-order /
  null / fail-closed-malformed unit tests, plus an end-to-end keep test where
  the page-2 reference is reached only via a param-before-rel `next` link.
- `npm test` 168/168, `npm run lint`, `typecheck`, `format` clean.

## Remaining review findings (separate PRs)

P2 rendered-token form to upload stdout; P2 DEL/C1 filename controls; P2 npm
pack build hook; P3 stale design.md (help/wrapper).
