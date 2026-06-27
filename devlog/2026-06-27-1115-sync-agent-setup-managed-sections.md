# 2026-06-27 11:15 — Sync agent-setup managed sections; record Codex reviewer

Ran `/agent-setup` in update mode ("Fix drift"). AGENTS.md carries all six
`agents-md:managed:*` markers; compared each block against the skill's
canonical text.

## Fixed

- **finish-line** drifted: 9-step checklist → canonical 11 steps, adding the
  review-watch start (step 8) and the let-the-watch-finish-before-handoff
  step (10).
- **pull-requests** drifted: restored the long self-review bullet
  (mechanical-hygiene framing) and added four missing canonical bullets —
  substantive-critique-needs-fresh-eyes, optional risk-gated pre-push review,
  record-a-noticed-reviewer, fix-the-class / don't-under-converge; expanded
  the "Watch for new review activity" handoff bullet to the canonical
  baseline-anchoring version.
- Post-edit diff confirms devlog / finish-line / branches / pull-requests /
  commits blocks now byte-match canonical; `done` principle text matches and
  its nested `project:done-checks` block was left untouched.
- **Recorded the automated reviewer** (new canonical convention asks for it):
  Codex, login `chatgpt-codex-connector[bot]` (REST, `type: Bot`), auto on
  push — added as a bullet in the unmanaged "Conventions & gotchas" section,
  not inside a managed block. Login observed on PR #39 reviews, not fabricated.

## Decisions

- Scope held to the managed-section sync + reviewer record. Scaffolding
  (devlog/README.md, PR template, CONTRIBUTING.md, CLAUDE.md) byte-matches the
  current skill templates — no change. Repo settings already aligned
  (merge-commit-only, auto-delete branches).

## Deferred (re-defer, out of scope)

- The standing `## To promote` queue items in earlier entries
  (2026-06-24-0600 sha256 content-binding invariant + github.ts lint nit;
  2026-06-24-0430 apierr.ts module; 2026-06-25-1114 invariant-4 pagination
  binding) are code-invariant promotions, not workflow-section drift. Most
  already appear in the current invariants 3/4/6; draining/auditing them is a
  separate code-docs concern, left for that PR.
