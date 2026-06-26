# README restructure: front-load the get-started path

Branch `docs/readme-restructure`. Owner wanted a deliberate pass at README UX.
The structural problem: install lived at the bottom (Distribution, ~line 281 of
394) and usage in the middle, behind "Why" + a "How It Works" internals
deep-dive — so a new reader's get-started path was split and late.

## Changes (reorder + 1 addition; content-preserving)

- **Added a top `## Quick Start`** right after the status block: the `npx
  @freeasinbird/gh-imgup` command, the two modes (body-compose vs `--pr`
  comment), the auth one-liner, and a pre-release pointer to the gh extension /
  source build.
- **Moved `How It Works` (mechanism/auth/upload-flow internals) below `Usage`** —
  readers use it before they need the internals.
- **Renamed `CLI Reference` → `Usage`** (options/env + Output + GitHub Actions),
  now the consolidated how-to, ahead of the internals.
- Everything else kept in place.
- **Review round (owner):** (1) added an agent-skill callout to Quick Start
  (`npx skills add …`) — the primary audience is agents, so the skill is a
  first-class get-started path and it surfaces the mandatory image review early;
  (2) moved `Repo Layout` (+ the "~2,400 lines / audit surface" line) OUT of
  Distribution to its own top-level section after Design Process — it's
  project-structure / audit-transparency, not "how to install."
- Order: Quick Start → Why → Primary Use Case → Usage → How It Works →
  Security Model → Known Tradeoffs → Distribution → Design Process → Repo Layout
  → Contributing → License.
- **Review round 2 (owner): killed brittle metrics.** The Repo Layout blurb said
  "~2,400 lines of TypeScript across 8 source files" — stale on every count
  (actual: 2,878 source lines, **9** files; the tree was missing `markdown.ts`,
  extracted earlier). Removed the LOC/file-count wording (it rots, as proven),
  kept the durable qualitative line ("zero runtime deps — the audit surface is
  `src/` plus Node built-ins"), and added `markdown.ts` to the tree. Lesson:
  don't put LOC/file counts in docs.
- **Codex P2 (real):** the Quick Start said the agent-skill command "installs the
  tool *and* its review" — wrong. `npx skills add` installs the SKILL.md
  (guidance + the pre-upload review guardrail), NOT the `gh-imgup` CLI; the agent
  still needs the CLI from Distribution. Reworded to "add the skill … it does
  **not** install the CLI." Accuracy on a get-started step.

## Faithfulness

No prose removed. Word count 2768 → 2873 (+105 = the Quick Start). Verified every
signature phrase still present (exactly-two-subprocess-calls, Agent Image Safety,
Repo Layout, etc.); anchors (`#distribution`, `#gh-cli-extension`) resolve;
`biome` lint/format clean. The big git diff is moves, not edits.

## Deferred / not done

- Did NOT aggressively trim or push depth into `docs/design.md` (the other lever
  I raised) — kept this PR a pure reorder so the structure decision is reviewable
  on its own. Trimming can be a follow-up if wanted.
- Left the status block's pre-release line as-is despite minor overlap with the
  Quick Start note (status = formal banner; quick start = actionable).
