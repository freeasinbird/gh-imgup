# design.md stale claims (review P3)

Branch `docs/design-md-stale-claims`. Sixth and last of the review batch — two
audited claims in `docs/design.md` no longer matched the code.

## Fixes

- **Scope-tradeoff claim (design.md:114).** Said the `contents:write` breadth
  tradeoff is documented "in its help output and README." Verified: the README
  documents it (lines ~206/226), but the `--help` text (index.ts `HELP`) only
  names the `contents:write` scope, not its breadth. Corrected to credit the
  README and note the help output names the scope but not the breadth.
- **gh-wrapper snippet (design.md:600).** Showed the wrapper as
  `npx --yes gh-imgup "$@"`. The real root `gh-imgup` wrapper resolves its dir,
  builds `dist/` if stale (local `npm run build`, no registry), and
  `exec node "$ext_dir/dist/index.js" "$@"` — never npx. Replaced the snippet
  with an abridged-but-accurate version and the offline/GitHub-only note,
  consistent with invariant 1's wrapper scoping.

## Verification

- Checked: no other `npx --yes gh-imgup` or help-output-breadth claims remain in
  docs/ README.md AGENTS.md (grep). Wrapper exec line quoted from the real
  `gh-imgup` script.
- Docs-only: `npm test` 164/164, lint, typecheck, format clean (no code touched).

## Batch complete

All six review findings now have open PRs (#22 pre-parse token redaction, #23
cleanup Link parsing, #24 rendered-token stdout guard, #25 DEL/C1 controls, #26
npm pack hook, this one). Each left open, green, for human review/merge.
