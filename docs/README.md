# Documentation

Design and reference material for `gh-imgup`. The project overview and usage
live in the top-level [README.md](../README.md); development conventions live
in [AGENTS.md](../AGENTS.md).

- [`design.md`](design.md) — the design spec: problem, architecture,
  upload flow, input validation, security model, known tradeoffs, the agent
  `SKILL.md`, and distribution. Produced through the adversarial
  security-audit process described in the README's Design Process section.
- [`agent-workflow.md`](agent-workflow.md) — the procedures AGENTS.md points
  to: handing off, reviewing, and merging a PR, stacked PRs, review
  convergence, the PR body, and the refute-first pass. Read a section when
  AGENTS.md sends you there.

The devlog (`../devlog/`) holds selected decision records: the reasoning
behind lasting decisions, not a log of every change. This directory holds the
standing design reference.
