# Sync devlog queue `->` state markers to canonical

Branch `chore/sync-devlog-queue-markers`. Ran agent-setup update mode
("Sync with latest version of agent-setup"). Comparator: five blocks in
sync; two drifted (`devlog`, `finish-line`), both tracing to one canonical
update: the explicit `->` queue-item state-marker protocol.

## Decisions / changes

- **`devlog` managed block:** "before starting" grep note now spells out
  what "open" means (no `->` marker, or an expired `-> re-deferred` clock,
  absent a drain record in a later entry or tracker issue); "before
  finishing" adds that draining/re-deferring appends a `->` marker to the
  source item. Pure canonical drift refresh.
- **`finish-line` managed block:** step 6 gains "marking the source item"
  on re-defer. Same canonical update.
- **`devlog/README.md`:** larger drift (predated the `->` protocol).
  Rewrote to the canonical scaffolding §devlog-readme: replaced the old
  "Frozen queue entries drain by reference" bullet with "Queue items drain
  by annotation" (`-> promoted in` / `-> re-deferred in` / `-> declined in`
  / `-> Refs #N`), plus the refreshed "revisable until merge" (append-only
  `->` exception), "write for the future re-litigator", denser "dense not
  capped", and "long-lived items become tracker issues" bullets. Now
  byte-identical to the template.

## Audit clean

- 7/7 managed blocks OK (comparator exit 0); PR template / CONTRIBUTING /
  CLAUDE.md still identical to templates.
- Automated-reviewer record (Codex, `chatgpt-codex-connector[bot]`) sits in
  the unmanaged Conventions section: no relocation needed.
- Repo merge settings now all correct, including
  `merge_commit_message: BLANK` (the `PR_BODY` mismatch flagged in the
  2026-07-07 sync entries has since been fixed): no re-flag.
- `npm run lint` (biome) clean. Docs-only change; no code touched.

## Deferred / re-deferred (not this PR)

- Standing `## To promote` items in earlier (frozen) entries (apierr.ts
  home, invariant 3 encoded-form, invariant 4 pagination binding, cleanup
  fail-safe posture, sha256 content-binding) are code-invariant docs,
  already-promoted or out of this managed-section sync's scope.
  Re-deferred unchanged, per the 2026-07-05 / 2026-07-07 sync entries.
  Retro-annotating those frozen entries with `->` markers is a separate
  cleanup, not this sync's scope.
- `CODE_OF_CONDUCT.md` still missing (flag only; open-source repo).
