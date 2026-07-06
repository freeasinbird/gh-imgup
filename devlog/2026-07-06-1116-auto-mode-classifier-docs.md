# Document the Claude Code auto-mode classifier fix

A real session's field notes (kept outside the repo,
`~/proj/freeasinbird/gh-imgup-claude-code-autoclassifier-notes.md`) showed
Claude Code's auto-mode safety classifier denying gh-imgup four times in a
row, all upstream of the tool itself:

1. `[Code from External]` on `npx -y @freeasinbird/gh-imgup --help`.
2. `[Code from External]` on the *local* binary with
   `GITHUB_TOKEN=$(gh auth token)`: the objection is external code + live
   token, not npx.
3. `[Self-Modification]` on the agent adding a `permissions.allow` rule.
4. `[Instruction Poisoning]` on the agent adding the `autoMode.allow` rule,
   even with the user's explicit go-ahead.

What resolved it: the user left auto mode, the agent wrote the
`autoMode.allow` entry under a normal file-write prompt, the user returned to
auto mode, and the upload ran clean. Existing docs (README pre-authorize,
SKILL, the AGENTS invocation gotcha) treated allowlisting as sufficient; the
2026-07-01-1004 entry covered only the per-run-prompt / npx `-y` friction,
not this classifier layer. This session folds the learnings into all three
surfaces.

## Decisions

- **Docs-only; the `--help` in-tool hint is deferred** to an issue. Its value
  is unproven: the denial happens before gh-imgup runs, so the hint only
  helps an agent that reads `--help` after a denial, and in the observed
  session even `--help` was denied (run #1 above).
- **README section over a new docs/ page.** The essentials fit in the
  existing "Pre-authorize for agents" section; a separate page would split
  the one story a user needs into two places. The full field notes stay
  outside the repo.
- **Facts audited against official docs** (code.claude.com, 2026-07-06)
  before publishing, per the docs-audit convention. Two corrections to the
  field notes' guesses were made in the shipped text:
  - The classifier runs as a **second gate after the permissions system**,
    not "before permission matching" as the notes inferred. Same practical
    effect (an allow rule doesn't prevent a denial), different mechanism.
  - `autoMode` is read from `~/.claude/settings.json`,
    `.claude/settings.local.json`, managed settings, or `--settings`, but
    **not** from a repo's checked-in `.claude/settings.json`; the README now
    says the rule can't be team-shared the way the permissions rule can.
- The agent-cannot-self-add-the-rule-in-auto-mode constraint is
  **field-observed, not documented** by Anthropic; the shipped text phrases
  it as observed behavior ("in our testing"), not a guarantee.
- The env-prefix gotcha (`GITHUB_TOKEN=… gh-imgup` doesn't match
  `Bash(gh-imgup *)`) is docs-confirmed and now in the README, with the
  `export GITHUB_TOKEN` workaround and the note that `autoMode.allow` prose
  rules are semantic and cover both forms.

- **The published snippet is narrowed to the pinned form** (Codex review
  finding, confirmed): the field-tested rule blessed both npx and the local
  binary in one entry, which contradicts the README's own
  bless-only-the-form-you-run guidance and would re-open the unpinned
  download path for pinned users. The README ships the pinned-form entry
  plus a one-line npx variant note; the both-forms rule remains what the
  original session actually ran.

- **The Claude Code part of "Pre-authorize for agents" is restructured
  around the mode split** (user feedback: the auto-mode issue was buried in
  a trailing gotcha list, and the section offered too many delivery
  mechanisms). Outside auto mode a permission allow rule is what matters; in
  auto mode the classifier is, and an allow rule doesn't prevent its
  denials, so the section is now two numbered mode-keyed paths, one snippet
  each. The `--allowedTools` per-session variant was cut, and the
  first-prompt "don't ask again" option compressed to a sentence; both are
  discoverable in Claude Code's own docs and were noise here.

- **The env-prefix workaround is "run it bare", not "export first"** (Codex
  review finding, confirmed): an `export` doesn't persist between an agent's
  Bash tool calls, so the exported variable never reaches the later
  `gh-imgup` call. The bare command both matches the allow rule and works,
  because gh-imgup falls back to the `gh` CLI token when `GITHUB_TOKEN` is
  unset (already documented under Auth).

- **"An allow rule is not enough in auto mode" was overbroad** (Codex review
  finding, confirmed against the docs): narrow Bash allow rules carry over
  into auto mode and resolve before the classifier; only broad
  arbitrary-code rules are suspended (plus everything, when
  `autoMode.classifyAllShell` is on). The docs don't classify pinned
  package-runner (`npx`) rules; the field session observed the npx form
  denied despite its matching rule, and the local-binary denial was an
  env-prefixed command no rule matches. The session never tested bare
  `gh-imgup` against its carried-over rule, which per the docs is not
  classifier-gated. All three surfaces now say the classifier gates what no
  narrow rule resolves, and the `autoMode.allow` snippet shows the npx form
  (the case observed to need it).

## Deferred / open

- `--help` classifier hint: filed as a follow-up issue (see PR).
- Whether other hosts' auto modes (Codex sandbox policies, etc.) need an
  equivalent documented path: no field data yet; revisit when it bites.
