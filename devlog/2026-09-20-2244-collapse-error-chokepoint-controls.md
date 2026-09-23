# Collapse control chars at the run() error chokepoint

Closes the same log-forging class that
`devlog/2026-09-21-1500-collapse-error-path-controls.md` (PR #111) addressed,
but at the general point those individual fixes missed. #111 collapsed control
characters in `release.ts`'s error/warn echoes of the filename. It did not
touch the paths reached *before* upload: `validateImageFile` (`src/validate.ts`)
throws `File not found: <filepath>`, `Unsupported file type: <filename>`,
`File is empty: …`, and the size-limit message with the raw, user-supplied
path. Those unwind to `run()`'s catch in `src/index.ts`, whose own comment
calls it "the one chokepoint for every such error" — yet it only ran
`sanitize()` (token redaction), never `collapseControls`. So a crafted CLI
filename bearing a CSI (U+009B) or other control byte still forged stderr/CI
log lines whenever validation failed, which is the easiest path to reach (the
file need not even exist).

## Decision

Collapse controls once, at the chokepoint: the non-redacted branch now echoes
the collapsed message. This covers every thrown error — `validate.ts`,
`release.ts`, and any future throw site — in one place, matching where token
redaction already lives.

Both forms are load-bearing: `decodesToToken` checks the original sanitized
message and the collapsed message before either can reach stderr. Collapsing
could hide an encoded token, while its inserted spaces can synthesize a token
containing internal spaces. Token resolution trims only the ends, so malformed
credentials containing spaces are accepted and still require redaction.

## Rejected options

- **Per-site collapsing in `validate.ts`** (mirroring #111's `release.ts`
  approach). More surface, and every future error site becomes a place to
  forget the collapse. The chokepoint is the general fix; the per-site work in
  #111 becomes defense-in-depth once this lands.
- **Centralizing collapse at the `warn()` sink too.** Rejected: warnings
  legitimately carry a trailing newline and multi-line formatting that
  `collapseControls` would flatten, and they bypass this catch. Warn sites that
  interpolate a user-controlled value still collapse it themselves (as #111's
  two `release.ts` warns do). This change is scoped to the thrown-error path.

## Relationship to PR #111

Complementary, not a replacement. #111 uniquely handles `release.ts`'s two
`warn()` paths, which never pass through this catch. #111's per-throw-site
`release.ts` collapsing overlaps this chokepoint for thrown errors and is kept
as defense-in-depth. This PR is based on `main` with #111 merged; its code
changes touch only `src/index.ts` + `src/index.test.ts`.

## Refute-first pass (credential-leak-surface class per AGENTS.md)

- **Original-form redaction retained.** `decodesToToken` still checks the
  pre-collapse message so collapsing cannot hide a previously detectable token.
- **Token synthesis confirmed and fixed.** A fake credential with an internal
  space was exposed by a missing-file path containing a tab instead of that
  space. Checking the collapsed form too prevents both literal and percent-
  encoded variants from reaching stderr. This corrects the rejected assumption
  that collapsing could never synthesize a token. The new regression fails
  against the pre-fix compiled implementation and passes with the two-form check.
- **Independent refutation found no remaining blocker.** Checking both forms
  preserves all original refusals and catches synthesized literal or encoded
  credentials before any network request.
- **Test guards the fix, not a tautology.** With the collapse removed from
  compiled `dist/index.js`, the new regression test fails (`not ok`); with it,
  it passes. Verified directly.

The token-synthesis finding is fixed; no findings remain outstanding.

## Verification

`npm test` (214 tests, +2 over the 212 on this base), `npm run lint`,
`npm run typecheck`, `npm run build` all clean.

Revisit when: a `warn()` sink gains a user-controlled interpolation without its
own `collapseControls`, or the single-line stderr error contract (invariant 7)
changes.
