# Sync pull-requests managed section to canonical

Branch `docs/sync-pr-managed-section`. Ran agent-setup update mode
("Sync skill updates"). Five of six managed blocks were already in
sync; `pull-requests` had drifted.

## Decisions

- The project's `pull-requests` block had diverged to **title+body**
  merge-commit prose ("the PR title and body become the merge commit
  message"). Canonical is **title-only** (title is the _entire_ merge
  message; body's review material never lands in history). Synced the
  block back to canonical. This restored three things the drift had
  dropped: the title-only framing, the explicit `--subject/--body`
  merge fallback, and the worktree-aware resync guidance in "if the
  user does ask you to merge".
- Confirmed direction by reading canonical vs project directly (I first
  misread the comparator diff header and had it backwards). Canonical =
  title-only is what the owner wants; the project text was the outlier.
- PR template: refreshed the Screenshots comment wording drift ("before
  merging" → "before handing off, and in every case before merge") to
  match `references/scaffolding.md`.

## Gotchas / follow-ups (not in this PR)

- **Repo setting mismatch.** `merge_commit_message` is `PR_BODY`, which
  contradicts the title-only prose and the agent-setup repo-settings
  table (`BLANK`). Flipping to `BLANK` is a repo-admin mutation, offered
  for the owner to confirm separately; not part of this docs PR.
- `CODE_OF_CONDUCT.md` still missing (flag only; open-source repo).

## Audit clean

- All 6 managed blocks OK after edit (comparator exit 0); devlog
  README / CONTRIBUTING / CLAUDE.md identical to templates.
- Repo settings otherwise aligned: merge-commit-only, auto-delete on,
  `merge_commit_title:PR_TITLE`, branch protection required context
  `check` reports correctly.
- Automated-reviewer record (Codex, `chatgpt-codex-connector[bot]`)
  present and complete in the unmanaged Conventions section.

## Deferred / re-deferred

- The open `## To promote` items from earlier entries (apierr.ts home,
  invariant 3 encoded-form) are code-invariant docs, outside this
  managed-section sync's scope. Re-deferred, unchanged, per the same
  reasoning as the 2026-07-05 sync entry.
