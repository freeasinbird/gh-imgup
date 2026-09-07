# Share the token-leak-guard predicate (github.ts + release.ts)

`postComment` (`src/github.ts`) and both guards in `uploadAsset`
(`src/release.ts`, the filename check and the returned-URL check) each
inlined the same two-part rule: `decodesToToken(raw, token) ||
decodesToToken(renderInlineMarkdown(raw), token)`. Three independent copies
of a credential-leak guard is exactly the drift risk `apierr.ts`'s own
top-of-file comment already warns about.

## Decision

- **Add `leaksToken(value, token)` to `src/apierr.ts`**, immediately after
  `decodesToToken`, composing it with `renderInlineMarkdown` exactly as the
  three call sites did inline (same order, same `||`, no new decode step).
  `apierr.ts` already documents itself as the shared home for credential-leak
  helpers ("Used by every module that talks to the API ... so the leak
  defenses live in exactly one place"), so this predicate belongs there, not
  in a new module. Adding `renderInlineMarkdown` to `apierr.ts`'s existing
  `import { collapseControls } from "./markdown.js"` line introduces no cycle:
  `markdown.ts` has no import from `apierr.ts` (confirmed by inspection —
  `markdown.ts` imports nothing from this repo).
- **Name: `leaksToken`.** Considered `tokenLeaksIn` as an equally clear
  alternative; picked `leaksToken` for consistency with the existing
  `decodesToToken` naming (subject-verb-object, predicate reads left to right
  at each call site: `if (leaksToken(body, token))`). Used consistently at all
  three call sites and in the new tests — no mixing.
- **Replaced all three inline sites** with `leaksToken(...)` calls:
  `github.ts`'s `postComment` body guard, `release.ts`'s `uploadAsset`
  filename guard, and `release.ts`'s `uploadAsset` returned-URL guard (the
  last two conditions of that `if` collapsed into one `leaksToken` call,
  keeping `isUsableAssetUrl` and the hex-suffix check unchanged).
- **Import cleanup.** `github.ts` no longer imports `renderInlineMarkdown`
  (its only use was the deleted inline `rendered` variable); it keeps
  `decodesToToken` for `usableCommentUrl`'s single-part check. `release.ts` no
  longer imports `decodesToToken` (no remaining direct call site) or
  `renderInlineMarkdown` (same); it keeps `collapseControls` for
  `displayFilename`.

## Deliberately out of scope

Three other `decodesToToken`/`renderInlineMarkdown` call sites were
identified and left untouched, so a future reader doesn't mistake the
narrower scope for an oversight:

- `github.ts`'s `usableCommentUrl` calls `decodesToToken` alone (no rendered
  form) — it decides whether to *echo* a response-provided URL, not whether to
  refuse an operation; a single-part check for a different purpose.
- `index.ts`'s top-level catch calls `decodesToToken` alone on a generic error
  message — also single-part, not the two-part refusal rule.
- `cleanup.ts`'s use of `renderInlineMarkdown` in the reference-scan closure
  matches asset URLs/names against issue/PR/comment/release-note bodies — a
  *reference-matching* predicate, never paired with `decodesToToken`, and not
  a token-leak guard at all.

## Refute-first verification (credential-leak surface, behavior-preserving refactor)

Per AGENTS.md's mandatory refute-first pass for a credential-leak-surface
change, following the pattern in
`devlog/2026-09-06-1530-share-asset-refetch.md`:

- **Diff of the moved logic.** `git diff` against the base commit confirms
  `decodesToToken` and `renderInlineMarkdown` are byte-identical before and
  after this change — only `apierr.ts` gained the new `leaksToken` function
  and an updated import line; no existing function body changed. `leaksToken`
  reproduces the inline `||` rule verbatim (same operand order, same
  short-circuiting), so the old-vs-new comparison below is really comparing
  the same underlying functions composed two different ways (inline vs.
  through the shared predicate) rather than two different implementations.
- **Old-vs-new corpus comparison.** Reconstructed the pre-change two-call rule
  in a scratch Node script (`oldRule(v, t) = decodesToToken(v, t) ||
  decodesToToken(renderInlineMarkdown(v), t)`), importing the compiled
  post-change `dist/apierr.js` (`decodesToToken`, `leaksToken`) and
  `dist/markdown.js` (`renderInlineMarkdown`). Built a 31-entry fixed corpus
  crossing: literal token present / absent; percent-encoding (single,
  double, triple, with malformed `%zz` noise, and near-misses); `\uXXXX`
  escapes (including a decoy that decodes to a non-token character); HTML
  entity forms (named single-char `&lowbar;`, numeric decimal and hex
  including zero-padded variants, the multi-char ligature `&fjlig;`, and
  near-misses of each); Markdown backslash escapes (`\_` and a non-matching
  backslash-escaped near-miss); a case-mismatch negative; and a few nested
  combinations (a percent-encoded value combined with a `\u`-escaped
  character, fully percent-encoded and fully numeric-entity-encoded spellings
  of the token's non-underscore prefix). Ran both `oldRule` and `leaksToken`
  over every entry and diffed the booleans.
- **Result: 0/31 divergences.** Scratch harness discarded per the issue's
  fallback (not committed); this note is the durable record of method and
  result.
- **Dispositions**: no findings surfaced by this pass; nothing to accept or
  reject.

`npm run lint`, `npm run typecheck`, and `npm test` (204 tests, including 7
new direct `leaksToken` unit tests and all previously-passing
`postComment`/`uploadAsset` coverage of the three refactored guards) are
green.

Revisit when: a fourth site needs the same two-part rule (confirms the
chokepoint is drawn in the right place), or when `usableCommentUrl`'s or
`index.ts`'s single-part checks are ever asked to add a rendered-form check —
at that point they'd become `leaksToken` call sites too, not exceptions.
