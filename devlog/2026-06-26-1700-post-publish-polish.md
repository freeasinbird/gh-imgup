# Post-publish polish (README + AGENTS.md)

Branch `docs/post-publish-polish`. Tidy-up after the package went live: now that
status is a badge, the heavy intro block earned its removal, and the release
process needed to land in AGENTS.md.

## README

- **Badges** under the title: npm version + CI status (high signal: current
  version + build health). Skipped license (redundant) and downloads (vanity).
- **Removed the Status blockquote** — post-publish it was redundant (badge =
  "published + version"; the feature recap duplicated the tagline). So **Quick
  Start now leads** right after the tagline.
- Kept the versioning/stability info as a concise **`## Versioning`** section
  (after Known Tradeoffs — the "what to know before depending on it" cluster).
- Moved the AGENTS.md / devlog / design.md pointers from the old Status block
  down into **Contributing**, where they belong.

## AGENTS.md

- New **`## Releases`** section (after Build, test, run): OIDC Trusted Publishing
  (no `NPM_TOKEN`), the `vX.Y.Z`-tag flow, scoped + `publishConfig.access`
  gotcha, idempotent skip-existing publish, manual-first-publish context, and
  the no-`*-<os>-<arch>`-assets rule (cross-refs the existing gh-extension
  gotcha).
- Noted **branch protection enforces** the "PR + green `check`, no direct pushes
  to `main`" convention (admin-enforced) — turning a convention into an enforced
  rule.

## Verification

- `biome` lint/format clean. README section order confirmed (Quick Start leads;
  Versioning before Distribution). Badge URLs use shields.io scoped-package +
  the ci.yml workflow badge. Docs only.
