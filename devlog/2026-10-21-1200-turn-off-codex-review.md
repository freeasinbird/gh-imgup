# Turn off automatic Codex PR review

On 2026-10-21 the owner turned off automatic ChatGPT Codex reviews for this
repository. This note records that choice and how the project records were
changed to match, since the decision otherwise exists only in chat.

## Decision

- **Replace the Codex reviewer record with an explicit no-reviewer note.**
  Deleting the record alone was rejected: earlier PRs still carry
  `chatgpt-codex-connector[bot]` reviews, and the reviewer-record rule
  (`docs/agent-workflow.md` §reviewer-record) lets an agent that observes one
  record the reviewer again. The owner note in AGENTS.md says not to.
- **Set the landing record's Reviewer to `none` and drop its completion
  marker.** `land-approved-prs` requires the Reviewer bullet (a missing one
  stops `bad-record`) and, while a login is recorded, holds each PR until that
  reviewer's summary carrying the marker appears. Left at Codex, every landing
  batch would wait on a review that no longer runs. With `none` the parser
  skips the marker and the reviewer filter.
- **No change to the managed workflow sections.** §pre-push-review already
  asks for fresh eyes before pushing any work in a repository without a bot
  reviewer. The handoff's "use `await-pr-review` when installed" step doesn't
  bind here, because that skill's own description excludes a repository with
  no automated reviewer.

## Accepted Residual

- **`await-pr-review` has no `none` reviewer record.** If an agent runs it
  anyway, its identity fallback scans recent PRs, finds
  `chatgpt-codex-connector[bot]`, and its rules say to record what it finds
  (they also say never to record that no reviewer exists, which targets an
  agent inferring absence, not an owner decision). The AGENTS.md owner note is
  the only guard against re-recording Codex. Teaching the skill a `none`
  record is a change in the free-skills repository, not here.

## Left Unchanged

- README and SKILL mentions of Codex as an agent host (its approval reviewer
  and the `["gh-imgup"]` allow prefix). They are about running gh-imgup from
  Codex, not about PR review.
- Earlier decision notes that cite Codex findings. They are frozen history.

Revisit when: an automated reviewer is turned on for this repository again.
Record it from an observed review and set both landing record Reviewer fields
to match.
