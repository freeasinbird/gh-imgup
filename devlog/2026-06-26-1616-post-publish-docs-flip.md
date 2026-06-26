# Post-publish docs flip (#17 item 3) — staged

Branch `docs/post-publish-flip`. The "flip pre-release → published" doc changes,
staged as a **draft PR** to merge the moment the manual first publish happens.
Not to be merged before the package is live on npm.

## Changes

- README **Status** block: "pre-release / not yet published / runs from a source
  build" → "Published on npm as `@freeasinbird/gh-imgup`" (link to the npm page);
  versioning note "will ship" → "ships".
- README **Quick Start**: dropped the "not on npm yet — use the gh extension /
  source build" blockquote (npx works once published). Kept the skill caveat.
- README **GitHub Actions** note: dropped the "until published, replace the npx
  step with a source build" + the run-from-gh-imgup-checkout `--repo` caveat
  (the published npx flow runs in the consumer's own checkout, so `--repo` is
  inferred).
- README **Distribution → npm**: "planned — not yet published" → real
  `npx` / `npm i -g` / version-pin instructions.
- **CHANGELOG**: `[Unreleased]` (with "nothing published yet") → dated
  `## [0.1.0] - 2026-06-26` + a fresh empty `[Unreleased]`; updated the link
  refs (`[Unreleased]` compare, `[0.1.0]` tag).

## ⚠ Before merging

- Merge **only after** `npm publish` succeeds (it announces "Published on npm").
- **Set the CHANGELOG date** to the actual publish day if not 2026-06-26.
- A `v0.1.0` tag/release should exist for the `[0.1.0]` CHANGELOG link to resolve.

## Verification

- grep: no `pre-release` / `not yet published` / `planned` phrasing remains.
  `biome` lint/format clean. Docs only.
