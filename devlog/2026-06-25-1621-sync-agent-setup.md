# Sync managed AGENTS.md sections to latest agent-setup

Branch `chore/sync-agent-setup`. Ran agent-setup in update mode to bring the
six managed blocks (and the devlog README protocol they depend on) up to the
current canonical text.

## Decisions

- Synced five drifted managed blocks against
  `references/canonical-sections.md`: `devlog` (promote-queue grep, dense/not-
  capped wording), `finish-line` (8→9-step checklist + refute-first pass for
  destructive/credential/trust-boundary changes), `branches` (Stacked PRs
  pointer), `pull-requests` (Responding-to-review, Keep-body-current,
  Reviewing-a-PR + Stacked-PRs sections, doc-claims discipline), `commits`
  (Fold-review-fixes bullet).
- `done` block left as-is: its principle text already matches canonical; the
  `agents-md:project:done-checks` sub-block is project-specific and is never
  overwritten by update mode. Confirmed the only diff vs. canonical lives
  inside that protected block.
- Refreshed `devlog/README.md`: old "Append-only — entries never edited"
  directly contradicted the new fold-fix rule (entries revisable until merge).
  Replaced the protocol with canonical (revisable-until-merge, dense-not-
  capped, canonical `## To promote` header, issue-for-maintainer-actions).
- Scaffolding otherwise in sync: CLAUDE.md, CONTRIBUTING.md, PR template all
  matched current templates — left untouched.

## Verification

- Extracted each managed block and diffed against canonical: all five MATCH;
  `done` differs only inside the project-checks sub-block (expected).
- `npm run lint`, `npx biome format .` clean; `npm test` 164/164 pass.
  Docs-only change — no src/ touched.
