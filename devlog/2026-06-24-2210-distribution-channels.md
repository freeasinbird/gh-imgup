# Distribution channels + project docs

Branch `feat/distribution-channels`: make the two non-npm distribution channels
real and add the release/security docs. The CLI was feature-complete after #9;
this stage packages it.

## Decisions

- **gh extension wrapper (`gh-imgup`, root, executable).** `dist/` is gitignored
  and `gh extension install` clones source only, so the wrapper builds once on
  first run (`npm ci --include=dev && npm run build`) then `exec node dist/index.js
  "$@"`. `--include=dev` because `tsc` is a devDep. Resolves its own dir through
  symlinks (npm link / dev). All bootstrap output to stderr (output contract).
- **SKILL.md** leads with the pre-upload image review as a MANDATORY hard gate
  (the highest-impact control per AGENTS.md), then concise usage/options/output
  contract. Frontmatter description is trigger-rich so agents invoke it for
  visual-change tasks and carry the secrets-review warning at discovery time.
- **SECURITY.md** = private-vuln-reporting flow + a summary of the architecture
  invariants, linking AGENTS.md/design.md rather than duplicating them.
- **CHANGELOG.md** Keep-a-Changelog; everything under `[Unreleased]` (nothing
  published yet). No version bump / no package.json change — release is a human
  call.

## Verification

build/lint/test green (147); wrapper execs the CLI direct and via symlink
(`--version`/`--help`). A 3-lens adversarial sweep (accuracy-vs-code, consistency
+wrapper, security-claims) caught real overclaims, all fixed: SECURITY.md +
CHANGELOG.md claimed every error path strips HTML-entity-encoded tokens — but
entity decoding lives only in the comment/cleanup guards, not the error path;
reworded to scope each surface accurately. SECURITY.md conflated `gh release
delete-asset` (per-asset) with `gh release delete` (whole release); separated.
Wrapper hardened (symlink resolve, `--include=dev`).

PR review (#10) caught a real wrapper bug: the build guard was existence-only, so
`gh extension upgrade` (git pull in place) left the stale gitignored `dist/` and
kept running the old CLI. Now rebuilds when any source/config is newer than
`dist/index.js` (`find -newer`), and reinstalls deps only when the lockfile
changed (so a source-only upgrade rebuilds offline). Verified: fresh→no rebuild,
touch src→rebuild, then stable→no rebuild.

PR review (#10, P1): the first-run `npm ci` in the wrapper fetched from the npm
registry during `gh imgup` startup — a non-GitHub network call the security model
doesn't cover, and it broke offline/locked-down users. Fixed: the run path NEVER
touches the registry. It rebuilds LOCALLY (`npm run build`, no network) when the
toolchain is already installed; when an install is actually required it stops with
an explicit one-time `npm ci && npm run build` setup hint instead of silently
installing. So runtime is GitHub-only and offline-safe once set up; the registry
step is a deliberate user action. README gh-extension section documents the
one-time build. (Future best-UX option, deferred + human/release call: ship a
precompiled gh-extension release so install is zero-setup.)

PR review (#10) two more: (1) the printed setup command `npm ci` would skip
`typescript` under an `omit=dev` npm config → `npm run build` (tsc) fails; the
hint and README copy now say `npm ci --include=dev`. (2) SECURITY.md's "the tool
makes exactly two subprocess calls ever" wasn't literally true for the extension
path (the wrapper runs readlink/find/npm/node); scoped the claim to the compiled
CLI and noted the wrapper is a thin bootstrap that interpolates no user input.
(3) The CHANGELOG carried the same unscoped "exactly two subprocess calls" claim;
scoped it to the compiled CLI with the wrapper note too.

PR review (#10): gh's `extension install` clones the source only "in the absence
of a release" — with a published *release* it expects prebuilt extension binaries
(verified in `gh extension install --help`, 2.79.0). The `_gh-imgup` image-asset
prerelease is ignored (gh skips prereleases), so install works today; but cutting
a normal versioned release would break the source-clone path. README now states
this; the proper fix is a release-strategy decision (below).

## Needs human action / promote

- **Release strategy for the gh extension.** Cutting a normal GitHub Release
  requires either shipping precompiled gh-extension binaries in it (proper
  binary-extension path, zero-setup install) OR keeping versions on npm + the
  `_gh-imgup` prerelease only (no normal release → gh keeps cloning source). A
  release workflow that builds/attaches the binaries is the path to the former;
  deferred as a maintainer/release-engineering decision.
- **Enable Private Vulnerability Reporting** (repo Settings → Security) so the
  SECURITY.md report link works; it's a public-repo feature, so confirm once the
  repo is public. SECURITY.md has a safe no-details fallback until then.
- README "Status: not yet implemented" block is now stale (upload pipeline ships)
  — deferred to the docs/AGENTS.md cleanup PR (the accumulated final stage).
