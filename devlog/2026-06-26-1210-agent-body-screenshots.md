# Agent screenshot body workflow docs

Branch `docs/agent-body-screenshots`. User clarified the goal: agents should be
able to upload screenshots and incorporate them into an issue/PR body, but the
CLI does not need first-class body-editing behavior.

## Decisions

- Kept the CLI boundary unchanged: `gh-imgup` uploads and returns Markdown/raw/
  JSON; the agent or `gh pr create/edit` owns issue/PR body composition.
- Repositioned README, design.md, and the agent skill around the preferred
  agent flow: run without `--pr` / `--issue`, capture stdout Markdown, and place
  it in the PR/issue body.
- Reframed `--pr` / `--issue` as follow-up comment convenience for existing
  threads or CI, not the main agent path.
- Clarified that `-m/--message` captions posted comments only; upload-only
  stdout remains machine Markdown/URL/JSON.

## Folded after #14 resolution

- #14 resolved while this PR was open: the old premise was wrong. Normal
  GitHub Releases do not break `gh extension install`; `gh` takes the binary
  path only when release assets use recognized platform suffixes. Folded the
  README/design correction into this docs PR and promoted the operational rule
  to AGENTS.md: do not attach `gh-imgup-<os>-<arch>` assets unless deliberately
  switching to a binary extension.
- PR review caught a real fail-open shell example: the README body-composition
  snippet would run `gh pr create` even if `gh-imgup` failed and wrote no image
  Markdown. Chained PR creation behind successful body-file generation.

## Verification

- `npm run format`, `npm run lint`, `npm run typecheck`, `npm test` (174/174),
  `npm run build`; after the #14 correction, reran `npm run format`,
  `npm run lint`, `npm run typecheck`, `npm test` (174/174), `npm run build`;
  after the review fix, reran `npm run format`, `npm run lint`,
  `npm run typecheck`, `npm test` (174/174), `npm run build`.
