# Canonical `npx -y` invocation for agents

Branch `docs/npx-agent-invocation`. Motivated by real friction: agents (Claude
in auto mode, Codex) failed to use the tool via npx on first try, and hit a
per-run approval prompt in auto mode.

## Root cause (one fix for two symptoms)

- Every doc/skill showed `npx @freeasinbird/gh-imgup …` with **no `-y`**. On an
  uncached package npx prints an interactive `Ok to proceed?` prompt that a
  non-interactive agent/CI can't answer → hang/fail.
- No permission rule matched the command, so Claude Code asked every run.

Canonicalizing on `npx -y @freeasinbird/gh-imgup …` fixes both: `-y` is
non-interactive (helps Claude *and* Codex), and the one stable string is what
gets allowlisted.

## Decisions

- **`-y` is now the canonical form** everywhere agent/user-facing: SKILL.md,
  README (Quick Start, Actions, Distribution), AGENTS.md run row. Promoted to
  AGENTS.md Conventions as a load-bearing gotcha.
- **Scoped name is mandatory** — documented that a bare `npx gh-imgup` is the
  unscoped, different registry package. Facts-only (no claim about its
  contents).
- **Allowlist reality documented** (README "Pre-authorize for agents"): for
  Claude Code, auto-run without prompt is always an allowlist decision —
  `Bash(npx -y @freeasinbird/gh-imgup *)` in `~/.claude` (all repos) or a repo's
  `.claude/settings.json`; equivalently the first-prompt "don't ask again"
  button or `--allowedTools`. Skills can't self-authorize (no permissions field
  in SKILL.md frontmatter). Codex has its own approval config; `-y` is the
  portable part.
- **Allow-rule spacing gotcha:** the trailing ` *` won't match a pinned
  `…@0.1.0` (no space before `@`); pinning needs `…@*`. Kept the canonical agent
  command **unpinned** so one rule covers it.

## Rejected / not done

- `docs/design.md` (3 stale `npx @…` mentions) left as **design history** — not
  rewriting the past; only live user/agent surfaces canonicalized.
- No CLI/code change — invocation, docs, config only.
- Updated the *global* `visual-evidence` skill's one npx mention on this machine
  for consistency (it delegates the command to the gh-imgup skill anyway); it's
  outside this repo, so not part of the PR.
- Updated the user's global `~/.claude/settings.json` allow rule directly (local
  machine action, not in the PR).

## Review round (folded into the commit)

- The skill-install commands (`npx skills add/update`, README lines 23 + the
  Distribution code block) hit the *same* uncached-npx prompt → added `-y` to
  those too. Left `npx playwright` in the CI example alone: different
  illustrative tool, already installed by the `npm ci` step above it.
- Sharpened the Codex sentence: auth vs command-approvals vs sandbox vs network
  are separate concerns — "configure Codex's command approvals, sandboxing, and
  network access separately" rather than "its auth is its own approval/sandbox
  config."

## Verification

- `grep -rn "npx @freeasinbird/gh-imgup" --include='*.md' .` excluding `docs/`
  returns nothing (all live invocations carry `-y`); the only remaining bare
  `npx` in README is the pre-installed `npx playwright` CI example.
- `npm run lint` / `typecheck` / `test` / `build` — docs/skill-only change, CI
  gate still run green before PR.
