# Close two release-process gaps found after 0.1.3

The 0.1.3 release surfaced two process gaps; both are now recorded in
the AGENTS.md Releases section so the next release doesn't repeat them.

## Decisions

- **README pinned examples track releases.** The two runnable pins
  (`npm i -g …@X.Y.Z`, CI `npx -y …@X.Y.Z`) were stale at 0.1.2/0.1.0;
  updated to 0.1.3 and added to the version-bump-PR checklist
  (`grep -n 'gh-imgup@0' README.md`). The ellipsized `…@0.1.0`
  allowlist illustrations stay version-agnostic on purpose: they
  illustrate a matching rule, and tracking them would add churn to
  every release for no reader benefit.
- **GitHub releases must be created per tag.** Tag-push publishes to
  npm but creates no GitHub release; v0.1.2 and v0.1.3 had tags only,
  leaving "Latest" pointing at v0.1.1. Backfilled both today
  (notes-only, normal releases, prose summaries of the CHANGELOG
  entries, matching the v0.1.0/v0.1.1 format) and added the
  `gh release create --verify-tag` step to the release process.
  Rejected: automating release creation inside release.yml; worth
  considering later, but it needs `contents: write` on a workflow
  that deliberately runs with `contents: read`, so it is a separate
  decision, not a quick addition (noted, not filed).

## Deferred

- Automating GitHub-release creation in release.yml (permissions
  widening decision, above).
