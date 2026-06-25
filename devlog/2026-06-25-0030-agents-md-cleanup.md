# AGENTS.md cleanup — drain the invariant backlog

Branch `docs/agents-md-cleanup` (PR #12). The deferred final docs stage: promote
the "to promote to AGENTS.md" notes accumulated across nine devlog entries (a
reflection workflow + `grep` confirmed none had ever landed) into the
project-editable sections of AGENTS.md.

## Decisions

- **Only edited the unmanaged sections** (Architecture invariants, Conventions &
  gotchas). The Devlog/Finish-line/Branches/PR/Commits/Done sections are
  `agents-md:managed:*` (skill-synced); editing them here gets overwritten.
- **Invariants:** scoped 1 to the compiled CLI (+ wrapper note); 2 wording; 3
  generalized token→credentials, decode-aware over literal/%XX/\uXXXX + control
  collapse (HTML-entity refusal is the comment surface, NOT apierr — kept
  accurate); 4 adds HTTPS-only + redirect:error + Link-next allowlisting; 6 the
  validate→upload SHA binding; 7 --json-is-array; NEW 8 (destructive-match decode
  + fail toward keeping + keep non-ASCII names); NEW 9 (re-bind response URLs).
- **Conventions:** --cleanup fail-safe/5-surface/non-TTY; case-folding;
  hex-suffix binding key; adversarial-verify gate; docs-audited-against-code;
  control-char regex gotcha; DI test-seam; drain-promote / file-issues.
- **General process learnings went upstream** to `../agent-setup-suggestions.md`
  (fold-fix, review etiquette, devlog protocol, non-suggestions) — they belong in
  the managed skill template, not this repo.

## Not done (out of scope)

- Code tidy-ups still open: github.ts `noUselessEscapeInRegex` info, extract
  `markdown.ts`, design.md parseGitRemoteUrl refresh.
- Two maintainer items to file as issues (per the new convention): Private Vuln
  Reporting; gh-extension release strategy. Not auto-filed.

## Verification

Docs-only; build/lint/test 147 green; managed markers intact (diff confined to
invariants + conventions). To-promote backlog now empty.
