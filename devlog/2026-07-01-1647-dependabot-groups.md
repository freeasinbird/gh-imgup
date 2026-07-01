# Group dependabot updates per ecosystem

Follow-up to the CI-hardening PR: dependabot's first run opened five
separate PRs (three actions bumps, two npm devDeps), which is the
one-time backlog but also the per-package default going forward.

## Decisions

- **Grouped updates, weekly cadence kept.** One `npm-dev` group and one
  `actions` group (`patterns: ["*"]` each): worst case two PRs per
  cycle, typically zero. Rejected: monthly interval (delays
  security-relevant action bumps for little gain at this surface).
- Merged the initial five individually (user call); #53/#54 needed a
  `@dependabot rebase` after #52 touched the same workflow files —
  grouping also removes that same-file conflict chain.

## Deferred

- Nothing new; promote queue unchanged from the 1640 entry.
