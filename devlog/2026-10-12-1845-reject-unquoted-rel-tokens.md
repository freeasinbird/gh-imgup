# Reject invalid unquoted rel tokens in Link header parsing

`parseLinkHeader` (`src/link-header.ts`) captured an unquoted parameter
value by scanning to the next `;`/`,` and trimming whitespace, with no
character-class check. A garbled unquoted `rel` (e.g. `rel=next<b>` or
`rel=nex t`) was accepted as a literal relation token that simply didn't
match `"next"`, so `rawNextLink` returned `null` — read as "no next
page" — instead of failing closed. Every sibling malformation the module
already guards (unterminated quote/target, missing comma, duplicate
`rel`, empty `rel`) throws; this was the one remaining path where a
garbled `rel` read as legitimately absent.

## Decision

- **Scoped the new check to `rel`, not every parameter.** Added
  `TOKEN_RE` (RFC 7230 `1*tchar`) and a new `unquoted` boolean, set only
  inside the unquoted-value branch. The check
  `name === "rel" && unquoted && !TOKEN_RE.test(value)` throws before the
  value is used downstream. Other parameters' unquoted values (e.g.
  `type=`) are parsed but never consumed — only `rel` feeds
  `rawNextLink`/`parseLinkHeader`'s returned `rel` array — so validating
  them would add parse failures without closing any reachable gap.
  Mirrors the file's existing precedent: duplicate/empty-`rel` checks are
  `rel`-scoped, while only structural checks (bracket/quote termination,
  delimiter placement) are global.
- **Left the quoted path untouched.** `unquoted` defaults `false` for
  the quoted branch and for a bare `; rel` with no `=` at all, so
  `rel="next last"` keeps its multi-token split and quoted values keep
  permitting internal whitespace per RFC 8288.
- **Empty unquoted `rel=` now throws via `TOKEN_RE` too** (requires
  `1+` tchar), overlapping with but not displacing the pre-existing
  `rel.length === 0` post-extraction check that covers the quoted-empty
  `rel=""` case.

## Refute-first verification (destructive-path trust boundary)

This header feeds the `--cleanup` pagination scan, so a misread here
risks ending the destructive scan a page early. Ran an independent
adversarial review (fresh-context subagent, instructed to disprove the
change) covering: `TOKEN_RE` char-class correctness (`-`/`^`/`.`/`` ` ``/
`|`/`*`/`+` all literal, not accidental ranges); scoping (no firing on
quoted `rel`, non-`rel` unquoted params, or bare `; rel`); every existing
test case hand-traced for unchanged outcome; whitespace/trim edge cases
(`.trim()` strips the full Unicode whitespace set, so nothing "looks
blank but isn't"); and the boundary claim that only `rel` feeds the
returned value (confirmed by reading the full function body — other
parameters' `value` only advances the cursor).

**Dispositions**: no findings — the review returned 0 CONFIRMED defects,
all checked scenarios REFUTED (regex exact, scoping correct, all 223
tests including new throwing/non-throwing cases pass, lint/typecheck/
build clean). Nothing to accept or reject.

Revisit when: a real GitHub `Link` header is observed with an unquoted
`rel` value containing a non-`tchar` character (would contradict the
RFC 8288 grammar this fix assumes and need an owner decision rather than
silent loosening), or when a malformed non-`rel` parameter is found to
reach `rawNextLink`'s return value through some path not yet traced.
