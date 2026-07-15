# Adopt selective decision notes (High-assurance profile)

First note under the decision-note protocol; it also closes out the
retired session-bookend/queue protocol.

## Decisions

- **Chose the High-assurance agent-setup profile** (user choice) over
  Decision-log or Standard: this project's value is its security model,
  so decisions in the risk classes must always leave a durable record.
  The mandatory-note list (recorded in AGENTS.md's intro): destructive
  cleanup or deletion behavior; credential and secret-leak surfaces;
  returned-response, deserialization, or remote-service trust
  boundaries; network destination and upload-routing decisions; CLI
  output contracts consumed by automation; security and release-policy
  changes.
- **Chose retiring the promotion queue without retro-annotation**
  (user choice) over retrofitting `->` state markers into the 61
  frozen entries: the markers were essentially never applied in
  practice, the queue was already drained de facto, and a one-time
  audit (below) is a cheaper, complete substitute. Historical entries
  stay byte-identical; devlog/README.md now declares them frozen
  history that no queue action is taken from. This cancels the
  retro-annotation cleanup that the 2026-07-08 marker-sync entry left
  as follow-on scope.
- **Refute-first verification records** for destructive /
  credential-leak / response-trust changes now land in the work unit's
  decision note when the change carries a mandatory-note decision,
  otherwise in the PR (user choice); the verification requirement
  itself is unchanged.
- **Repo settings**: enabled `allow_update_branch` and
  `required_status_checks.strict` on `main` (user choice, both), so
  stale PRs surface an update action and merges require the branch to
  be current with `main`, matching the synced base-freshness handoff
  pass.

## One-time queue audit (final drain record)

Sweep of all 61 queue-era entries; dispositions, no entry mutated. The
first pass grepped only the queue vocabulary (`## To promote`, deferred,
needs-human); a Codex review finding on this PR exposed deferrals
phrased outside it ("scoped out", "follow-up (not done here)", "filed
separately"), so a second pass swept those forms and a final pass
reconciled every deferral-shaped heading in the corpus. Combined
results:

- **Already promoted, nothing to do**: apierr.ts as the single home for
  API-error/token-leak defenses, encoded-leak + control-char redaction
  (invariant 3), validate→upload SHA-256 binding (invariant 6),
  pagination re-binding on the cleanup path (invariant 4), cleanup
  fail-safe/interactive posture (invariant 8 + Conventions), the stale
  README status block (long gone), and the merge-message repo-setting
  mismatch flagged and re-deferred by the 2026-07-07 sync entries: the
  repo now reads PR_TITLE / BLANK (re-verified in this session's
  settings audit), so the reminder those frozen entries carried is
  discharged.
- **Drained by tracker issues (closed)**: gh-extension release strategy
  (#14), Private Vulnerability Reporting (#13), the github.ts lint nit
  (#15), the `--help` classifier hint (#64).
- **Still actionable, already tracked**: automating GitHub-release
  creation in release.yml, carried by open issue #61.
- **Still actionable, newly tracked**: refactor-only structure findings
  plus a `version()`-failure test from the 2026-07-01 security-review
  pass (Follow-up: #68); error-path control-char collapsing of raw
  `file.filename` echoes, scoped out by the 2026-06-26 strip-controls
  entry and surfaced by the Codex review (Follow-up: #70); the per-run
  stderr secret-review reminder whose "filed separately" claim in the
  2026-06-26 visual-evidence entry was never backed by an issue
  (Follow-up: #71); the Markdown output-escaping invariant promotion
  and the README skill-invocation caveat refresh (Follow-up: #72).
- **Declined as optional**: the "trim README depth into docs/design.md
  if wanted" observation (2026-06-26 readme-restructure entry) stays a
  historical observation; recorded in #72 so it isn't re-raised.
- **Owner-parked, deliberately unfiled**: whether to keep the
  gh-extension distribution channel at all (2026-06-26 release-asset
  entry; distinct from the #14 binaries decision). No trigger exists,
  so no issue; revisit when usage data or the channel's maintenance
  cost makes the keep/drop question live.
- **Converted to revisit conditions in AGENTS.md**: OS matrix and
  coverage gate (CI bullet); other hosts' auto/approval modes
  (auto-mode gotcha). The `redactField` unbounded-decode deferral
  (2026-07-01 entry) stays a decided deferral on its recorded
  MITM-only-reachability rationale; nothing new to track.

## Provenance

Canonical source: freeasinbird/free-skills
`94c46442a906c21dbabf10598bc87108f4fa698b` ("Replace session devlogs
with selective decision notes (#69)").

Revisit when a queue-era entry's content is re-litigated: read it as
evidence only; anything still actionable in one belongs in the issue
tracker, not back in a queue.
