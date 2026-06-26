# SKILL.md: invoke the published package (self-sufficient skill)

Branch `fix/skill-published-invocation`. Follow-up to the #33 Codex thread: the
skill assumed a bare `gh-imgup` on PATH, so installing the skill alone (`npx
skills add …`) didn't give an agent a runnable tool. Owner's call: write the
skill "as if published."

## Change

All invocations in `skills/gh-imgup/SKILL.md` → `npx @freeasinbird/gh-imgup`
(the usage signature, the four command examples, and the `--raw` capture). Added
a one-line note: zero-install via `npx` (Node 22+); if already on PATH (global
install or the `gh` extension as `gh imgup`) use that — flags identical.

Once published, the skill is self-sufficient: add the skill → agent runs
`npx @freeasinbird/gh-imgup` → npm fetches it on demand, no separate global
install. Pre-publish it fails like any npx of an unpublished package; that's the
deliberate "as if published" posture (matches the README leading with npx).

## Untouched

The MANDATORY pre-upload image-review section (the load-bearing security control,
AGENTS.md) is unchanged. The skill `name`, heading, and `_gh-imgup` tag stay.

## Follow-up (not done here)

The #33 README Quick Start caveat ("the skill … does not install the CLI — the
agent still runs `gh-imgup` from Distribution") is still accurate (the skill
installs no binary; npx is a Distribution option), but could be refined to say
the skill now invokes via `npx @freeasinbird/gh-imgup`. Left for after #33
merges, to avoid thrashing that PR.

## Verification

- `grep`: no bare `gh-imgup <file>` invocation remains; 7 npx invocations.
  `biome` lint/format clean. Docs-only (skill), nothing to test.
