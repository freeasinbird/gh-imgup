# Adopt a label-based landing record

The agent-setup landing record lets `land-approved-prs` run a landing batch
for this repository. Earlier on 2026-10-19 the owner skipped it during the
agent-setup sync in PR #130 (issue #129). Later the same day the owner chose to
add it, together with the two labels it names. This note records that choice
and the defaults it keeps, since the decision otherwise exists only in chat.

## Decision

- **Adopt the landing record with the template defaults.** Mechanism `label`,
  approval label `approved`, hand-back label `needs-human`, stale lock age
  240 minutes, no base-advance checks. The record sits beside the forge and
  reviewer records in the unmanaged "Conventions & gotchas" section of
  AGENTS.md, so a managed-block sync can't rewrite it.
- **Approver permission stays at `write`.** `freeasinbird` is an organization,
  so `maintain` and `admin` were available as stricter floors. The project has
  one owner and no other collaborators, so a higher floor would change nothing
  today, and `write` is the template default every other agent-setup project
  starts from. Revisit if collaborators with write access are added who
  shouldn't be able to approve a landing.
- **Reviewer fields copy the existing reviewer record.** Login
  `chatgpt-codex-connector` (the record's `[bot]` suffix stripped, as the
  landing parser requires) and completion marker
  `codex-pull-request-review-summary`, observed on PR #128. The marker already
  fits the parser's character set, so nothing was shortened or replaced.
- **Labels were created with the skill's default colors and descriptions.**
  Creating them grants nobody approval: only a collaborator with the Approver
  permission applying `approved` to a PR does, and agents never add either
  label to a PR.

## Rejected

- **Leaving the record absent (the morning's choice).** Without it,
  `land-approved-prs/list-ready.sh` stops with `no-landing-record`, so the
  landing skill the forge record already lists as a consumer couldn't run
  here. The owner reversed the skip once that gap was spelled out.

Revisit when: a second collaborator with write access joins (raise the
Approver permission floor), or the Codex reviewer login or completion marker
changes (both must keep matching the reviewer record).
