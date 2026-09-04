# Extract the Link-header parser into src/link-header.ts

Issue #80 (attempt 2). `src/cleanup.ts` mixed an RFC 8288 `Link`-header
parser (`parseLinkHeader`, `rawNextLink`, `LINK_PARSE_ERROR`) with
pagination *policy* (`nextLink`'s target/repo/query/page rebinding,
`listPages`) and cleanup orchestration. The parser has no dependency on
cleanup's domain; keeping it co-located made the file harder to read as
two responsibilities and made the parser's own contract (e.g. non-`next`
relations, multi-token `rel`) only indirectly testable through
`rawNextLink`.

## Decision

- **Pure move, `src/link-header.ts`.** `LINK_PARSE_ERROR`,
  `parseLinkHeader`, and `rawNextLink` moved verbatim (bodies unchanged).
  The one intentional surface change: `parseLinkHeader` is now exported,
  so `link-header.test.ts` can assert its full per-link-value contract
  directly instead of only through `rawNextLink`'s "does it find next"
  lens. `LINK_PARSE_ERROR`'s doc comment was reworded to drop the
  same-file `{@link listPages}` assumption (now "the cleanup pagination
  scan") since `listPages` lives in a different file.
- **`nextLink` and pagination policy stay in `cleanup.ts`.** Parsing an
  RFC 8288 header and deciding whether a *specific* next-page URL is safe
  to follow for *this* scan (same repo, same endpoint, contiguous page,
  preserved query) are different responsibilities: the parser has no
  notion of "this scan" or "this repo," and folding policy into the
  parser module would pull cleanup's destructive-path concerns into a
  module that should be usable (and testable) independent of them.
  Rejected merging them into one file as it would recreate the original
  mixing this move is meant to undo.

## Refute-first verification (destructive-path trust boundary)

`parseLinkHeader`/`rawNextLink` gate whether `cleanup()`'s repository scan
is considered complete before it deletes assets, so this move is on the
mandatory-note list per AGENTS.md even though it changes no decision
logic.

- **Text diff of the moved bodies.** Diffed the pre-change
  `src/cleanup.ts` (base commit 9ba3814, lines 54-169) against the new
  `src/link-header.ts`. The only differences: the reworded
  `LINK_PARSE_ERROR` doc comment (planned, doc-only) and the `export`
  keyword added to `parseLinkHeader` (planned, the intentional surface
  change). No line inside either function's decision logic changed.
- **Old-vs-new corpus comparison.** Reconstructed the pre-move
  `parseLinkHeader`/`rawNextLink` verbatim from `9ba3814:src/cleanup.ts`
  in a scratch ES module, imported the compiled post-move
  `dist/link-header.js`, and ran both over a 29-input corpus (58
  comparisons across the two functions): absent/null/empty/whitespace-only
  header, no-brackets garbage, unterminated target, unterminated quote,
  missing comma between link-values, duplicate `rel`, all three empty/
  valueless `rel` shapes, parameter-before-`rel` and `rel`-before-param
  ordering, multiple relation tokens (including a 3+-token value with
  extra internal whitespace), case-insensitive `rel`, a comma inside the
  target, multiple link-values with mixed relations, OWS around `;`/`,`
  delimiters, an escaped quote inside a non-`rel` quoted parameter, a
  trailing-backslash-before-close edge case on the escape branch, a
  link-value with no `rel` param at all, a whitespace-only `rel` value,
  a trailing comma, and leading whitespace before the first link-value.
  Compared return values (deep-equal) and thrown-error messages.
  **Result: 0/58 divergences** — the move introduced no behavior change.
  Scratch harness discarded per the issue's fallback (not committed); this
  note is the durable record of method and result.
- **Dispositions**: no findings surfaced by this pass; nothing to accept
  or reject.

Revisit when: `parseLinkHeader`/`rawNextLink` need a caller outside
`cleanup.ts`, which would confirm the module boundary is paying for
itself, or when `nextLink`'s policy grows complex enough to warrant its
own file separate from `listPages`/orchestration.
