# package.json publish-readiness metadata

Branch `chore/package-metadata`. From the package.json audit — small additions
to polish the npm listing and add a pre-publish gate. No version/dep change.

## Changes

- `homepage`: the **bare repo** URL, not `…#readme`. The repo root already
  renders the README plus releases/issues/code nav; `#readme` just scrolls the
  same page. (Owner agreed.)
- `bugs`: the issues URL — powers `npm bugs` and the npm listing's Issues link.
- `prepublishOnly`: `npm run lint && npm run typecheck && npm test` — the full
  non-mutating Definition-of-Done gate (not `format`, which writes) runs before
  any `npm publish`, so a manual publish can't ship a failing build. Verified the
  gate passes (175 tests, lint/typecheck clean).

## Decisions

- **`engines.node` stays `>=22`.** The compiled CLI runs on Node 20 (verified
  20.19.5), but Node 20 reached **EOL in April 2026**, so `>=22` correctly
  targets supported LTS lines and matches the README/AGENTS "Node 22+" statement.
  No reason to officially support an EOL runtime.
- **Comments kept in `dist/`** (no `removeComments`) — deliberate; audit-friendly
  installed package, owner's call.
- `main`/`exports`/`types` stay absent — bin-only CLI, no library entry point.

## Verification

- `npm pkg get` confirms the fields; `npm run prepublishOnly` exits 0;
  `npm pack --dry-run` still 12 files (metadata-only, nothing new shipped);
  `biome` lint/format clean.
