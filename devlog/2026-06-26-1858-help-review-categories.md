# Expand --help to the full pre-upload review checklist

`--help` ended with a one-line "Review every image for secrets before upload",
while the SKILL.md MANDATORY review covers more (internal hostnames/IPs/infra,
customer data/PII). The SKILL.md isn't bundled in the npm package, so the CLI's
help is the *only* review guidance a CLI-only agent (or anyone not loading the
skill) sees — and it was narrower than the real, load-bearing review. Surfaced
by a P2 review on the visual-evidence skill (free-skills #20), where the
fallback breadcrumb leaned on this `--help`.

## Change

- `src/index.ts` HELP tail now lists the four review categories, mirroring the
  SKILL.md MANDATORY section (credentials; internal hostnames/IPs/infra;
  customer/PII; anything not meant to be shared) + "if any, don't upload".
- `src/index.test.ts`: new assertion that `--help` contains the categories, so
  the complete checklist can't silently regress to the shorthand.
- CHANGELOG: Unreleased / Changed entry.

## Decisions

- **Mirror the SKILL.md list, one conceptual source.** Kept the same four
  categories so help and skill don't drift; help is the terse reflection, the
  SKILL.md keeps the rationale ("no un-publish", "when in doubt ask").
- **No version bump.** Help-text change; leaving the release/version decision
  (and lockfile sync) to the owner per the 0.1.1 lockfile-sync gotcha.
- **`--help` only (owner's call).** The complementary per-run stderr warning —
  for agents that skip `--help` — stays deferred as a separate item.

## Verification

`npm run lint` / `typecheck` / `test` — the existing `--help` prefix test plus
the new category assertions.
