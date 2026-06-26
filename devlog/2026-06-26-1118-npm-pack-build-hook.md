# npm pack build hook (review P2)

Branch `chore/npm-pack-build-hook`. Fifth of the 6-finding review batch. `dist/`
is gitignored, the `bin` points at `dist/index.js`, and `files` ships `dist` —
but there was no pack-time build hook, so `npm pack`/`npm publish` from a clean
checkout produced a tarball with only LICENSE/README/manifest (no `dist/`): a
broken install. Secondary: the built tree also shipped every `dist/*.test.js`.

## Fix

- `package.json`: add `"prepack": "npm run build"`. Chose `prepack` over
  `prepare` — it runs on exactly the surfaces that matter (`npm pack` and
  `npm publish`) without rebuilding `dist` on every dev `npm install`. (Consumers
  installing the published tarball don't trigger it; the tarball already carries
  `dist`.)
- `files`: add `"!dist/**/*.test.js"` so the compiled tests (which must stay in
  `dist/` for `npm test`) don't ship.
- AGENTS.md: gotcha note that `prepack` is load-bearing (don't remove) and that
  `files` excludes the compiled tests — this bit, so it's promoted.

## Verification

- Empirical, from a clean state: `rm -rf dist && npm pack --dry-run --json` —
  `prepack` rebuilt `dist`, the tarball includes all `dist/*.js` (incl. the
  `dist/index.js` bin) and ZERO `*.test.js`. Confirmed the `!` negation works.
- `npm test` 164/164, `npm run lint`, `typecheck`, `format` clean.

## Not in scope (deferred to a human, unchanged)

The release-strategy decision for the `gh` extension (ship prebuilt binaries vs.
npm + prerelease-only) from [[2026-06-24-2210-distribution-channels]] is a
maintainer/release-engineering call, untouched here.

## Remaining review finding (separate PR)

P3 stale docs/design.md (help disclosure + gh-wrapper snippet).
