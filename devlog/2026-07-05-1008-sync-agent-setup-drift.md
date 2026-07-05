# Sync agent-setup drift

Branch `chore/sync-agent-setup` (PR pending). Ran `/agent-setup` in update
mode to fix setup drift: the six managed AGENTS.md blocks and three scaffolding
files had fallen behind the current canonical/template text since the last sync
(PR #21, 2026-06-25).

## Fixed

- **AGENTS.md 6 managed blocks** (devlog, finish-line, branches, pull-requests,
  commits, done) refreshed to canonical via a splice script keyed on the markers;
  the `done` block's nested `project:done-checks` (real npm verification commands)
  preserved verbatim. Comparator now reports `ok` on all six.
- **devlog/README.md** to template: adds the "Frozen queue entries drain by
  reference" bullet, delegates session-bookends to AGENTS.md instead of inlining
  the find command, drops em dashes.
- **CONTRIBUTING.md** and **.github/pull_request_template.md** to template
  (em dashes → commas/parens; PR-template Why/What/Screenshots wording).
- CLAUDE.md already matched; untouched.

## Decisions

- Deleted a stale local `chore/sync-agent-setup` branch (its PR #21 already
  merged, remote gone, 0 commits ahead) and reused the name for this sync.
- Splice-by-marker (Node script) over hand-editing each wording delta: the
  canonical drift spanned ~230 lines across 6 blocks; mechanical replacement
  between markers is less error-prone and the comparator verifies it.

## Deferred / re-deferred

- The open `## To promote` items (apierr.ts home, invariant 3 encoded-form
  generalization + control-char stripping, invariant 4 pagination binding,
  cleanup fail-safe posture) are code invariants **already promoted** into the
  current AGENTS.md (drained in PR #12 and later). Out of this text-sync scope;
  confirmed-drained by reference, not re-raised.

## Verification

- `bash compare-managed-blocks.sh AGENTS.md` → `ok` on all six blocks, EXIT 0.
- Scaffolding files byte-match their templates (devlog/README, PR template,
  CONTRIBUTING, CLAUDE).
- Repo settings audited, no drift: merge-commit-only, auto-delete on, PR
  title/body → merge commit; branch protection requires `check`, reported by
  the fan-in job. Codex reviewer record present and unmanaged.
- Docs-only change: no `src/` touched, so npm build/test/typecheck behavior
  unchanged.
