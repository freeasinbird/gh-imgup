# Release workflow (#17 item 2)

Branch `chore/release-workflow`. Adds `.github/workflows/release.yml` for the
tag-triggered npm publish, per the Trusted Publishing decision.

## Design

- Trigger: push of a `v*` tag.
- `permissions: { contents: read, id-token: write }` — OIDC for npm Trusted
  Publishing. **No `NPM_TOKEN`.**
- Steps: checkout → setup-node 22 (+registry-url) → `npm install -g npm@latest`
  (trusted publishing needs npm ≥ 11.5.1; Node 22 ships older) → `npm ci` →
  tag-vs-`package.json`-version guard → `npm publish`.
- `npm publish` runs the package's own gates (prepack=build, prepublishOnly=
  lint+typecheck+test) and publishes scoped-public via `publishConfig`. No
  `--provenance` flag — provenance is automatic under trusted publishing.
- Deliberately does NOT create a GitHub Release or attach assets — keeps the
  source-install `gh` extension working (invariant: no `*-<os>-<arch>` assets).

## Scope / order

This handles **v0.1.1 onward**. The first `0.1.0` publish is manual (the package
must exist before the trusted publisher can be configured on it), and the tag
guard means re-tagging an already-published version fails at `npm publish`
(expected). Inert until a `v*` tag is pushed — safe to merge ahead of the first
publish.

## Verification

- Not run (no tag / trusted publisher yet). YAML validated with `js-yaml`
  (trigger, permissions, steps parse correctly). `npm run lint` clean.
