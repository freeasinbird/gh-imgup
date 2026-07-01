# Promote security-session learnings to AGENTS.md

Drains the promotion candidates from today's three entries (1630, 1640,
1647). Docs only, no code.

## Promoted

- **CI fan-in gate** (Build/test/run): the `check` job's name, its
  `if: always()`, and the explicit result test are load-bearing; a plain
  `needs:` would fail open because branch protection treats a skipped
  required check as satisfied. Was only a workflow comment + devlog.
- **Invariant 3 file map**: `collapseControls` now lives in markdown.ts,
  `sanitize` in auth.ts; added the MAX_DETAIL-inside-MAX_SCAN containment
  constraint (raising MAX_DETAIL past MAX_SCAN breaks the no-leak
  argument silently).
- **Invariant 9**: `boundGithubUrl` (validate.ts) named as the shared
  core new response-URL validators must route through.
- **Cross-platform npm scripts** (Conventions): no Unix-only commands;
  npm uses cmd.exe on Windows (the Codex P2 class from PR #50).

## Not promoted (decided)

- Dependabot grouping rationale: colocated comment in dependabot.yml
  carries it.
- Null-prototype entity map: implementation detail; code comment plus
  regression tests pin it.

## Extracted elsewhere

- Cross-project lessons (required-check matrix fan-in, equivalence
  harness for trust-boundary refactors) written up for the agent-setup
  skill in ../agent-setup-updates.md (outside this repo).
