# release.yml: skip-if-already-published guard

Branch `chore/release-skip-existing`. 0.1.0 was published manually before
release.yml became the mechanism. To cut a `v0.1.0` tag + GitHub Release without
the workflow choking (it would `npm publish` 0.1.0 again → red run), make the
publish idempotent.

## Change

The "Publish to npm" step now pre-checks `npm view "$name@$version"`: if that
exact version is already on the registry, it logs and `exit 0` (green no-op);
otherwise `npm publish`. Established pattern (PyPI's `skip-existing`).

Safe: it only skips when the version genuinely exists; a real auth/OIDC/network
failure isn't "version already exists," so it still fails loudly. Header comment
updated (re-tagging an existing version is now a no-op, not an expected failure).

## Enables

The suggested release order: merge this → tag `v0.1.0` + GitHub Release (workflow
runs green via the skip) → merge the docs flip (#36, its `[0.1.0]` CHANGELOG link
resolves). From v0.1.1 the workflow publishes normally.

## Verification

- YAML validated (`js-yaml`). Guard logic dry-run against the live registry:
  `@freeasinbird/gh-imgup@0.1.0` → SKIP; `@9.9.9` → PUBLISH. `npm run lint` clean.
- Not run end-to-end (needs a tag + the trusted publisher configured).
