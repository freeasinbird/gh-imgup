# Sync context + devlog sections to canonical

Branch `chore/sync-agent-setup-sections`. Ran agent-setup update mode
("Sync with latest version of skill"). Comparator: five blocks in sync;
one drift and one missing block, all tracing to one canonical update
(checkpointed/incremental devlog entries).

## Decisions / changes

- **`devlog` managed block:** added the "the entry may be built
  incrementally at checkpoints while its PR is unmerged (see
  devlog/README.md)" clause it was missing. Pure canonical drift refresh.
- **`context` managed section:** was absent entirely. Owner confirmed
  adoption; inserted the canonical "Context discipline" section at its
  conventional slot (after finish-line, before Build/test/run), wrapped
  in `agents-md:managed:context` markers. Comparator now reports all
  seven blocks OK (exit 0).
- **`devlog/README.md`:** added the matching "Checkpoint long sessions"
  bullet (same canonical update as the block clause). Now byte-identical
  to `references/scaffolding.md` §devlog-readme.

## Audit clean

- 7/7 managed blocks OK (comparator exit 0); PR template / CONTRIBUTING /
  CLAUDE.md still identical to templates.
- Automated-reviewer record (Codex, `chatgpt-codex-connector[bot]`)
  sits in the unmanaged Conventions section: no relocation needed.
- `npm run lint` (biome) clean. Docs-only change; no code touched.

## Deferred / re-deferred (not this PR)

- **Repo setting `merge_commit_message: PR_BODY`** still contradicts the
  title-only prose (should be `BLANK`), flagged in the 2026-07-07 sync
  entry. Repo-admin mutation, outside this docs PR's scope; surfaced to
  the owner again.
- Open `## To promote` items from earlier entries (apierr.ts home,
  invariant 3 encoded-form) are code-invariant docs, outside this
  managed-section sync's scope. Re-deferred unchanged, per the 2026-07-05
  and 2026-07-07 sync entries.
- `CODE_OF_CONDUCT.md` still missing (flag only; open-source repo).
