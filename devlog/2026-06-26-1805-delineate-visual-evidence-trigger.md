# Narrow the skill trigger to delineate from visual-evidence

A new `visual-evidence` skill (in `freeasinbird/free-skills`) owns the
before/after *capture craft + workflow timing* and delegates the upload step
here. gh-imgup's description triggered on "a change is visual and a screenshot
would help a reviewer" — which reaches into that skill's territory and would
make both fire on the same moment.

## Change

- SKILL.md frontmatter `description`: narrowed the trigger to the
  upload/attach moment ("when you have an image in hand to publish or attach").
  Capture is framed as "a separate upstream step; use a screenshot/capture
  workflow skill if you have one" — **generic, not named**. The `ALWAYS review
  each image for secrets` clause is kept verbatim — load-bearing, must not
  weaken.
- SKILL.md body intro "Use this when…" sentence: realigned to the same seam
  (you already have the image; capture is a separate concern). Same single
  concern.

## Don't name visual-evidence (coupling direction)

Initially this PR named the visual-evidence skill as a mirror of how it names
gh-imgup. Reversed that: the dependency is one-directional. visual-evidence
*depends on* gh-imgup (and names the concrete `@freeasinbird/gh-imgup` CLI it
must run — naming a tool you invoke is correct). gh-imgup does **not** depend on
visual-evidence — it uploads any image standalone, and ships independently
(own repo + npm package) to users who usually won't have visual-evidence. Hard-
coding a sibling *prompt skill's* name into a published tool asserts something
usually absent and dangles on rename/move. So: name a tool you depend on; refer
to an upstream skill only generically.

## Scope held

README, AGENTS.md, package.json `description`, and `src/index.ts` CLI help
left unchanged — they describe the *tool* (it uploads images), which is still
accurate and doesn't drive skill triggering. No test asserts the description
text, so nothing to sync. (Note: the CLI `--help` already ends with the
secret-review line and ships in npm, so a CLI-only agent gets that requirement
from the tool. A per-run stderr warning for agents that skip `--help` is a
worthwhile follow-up, filed separately — out of scope for this docs change.)

## Pairing

Coordinated with free-skills PR "Add the visual-evidence skill" (which names
the gh-imgup CLI as its upload fallback). Two independent repos/PRs; either can
merge first. No shared trigger phrase: visual-evidence = "I'm doing/reviewing
visual work, produce evidence"; gh-imgup = "I have image bytes to publish."

## Verification

Description-only change; `npm run lint` / `typecheck` / `test` run to keep CI
green (behavior unaffected).
