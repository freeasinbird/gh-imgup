# AGENTS.md style sweep + Codex reviewer note

Branch `docs/agents-md-style-sweep` from `main`. Follows the README (#47) and
SKILL (#48) style passes; brings AGENTS.md to the same em-dash-free style.

## Em-dash sweep (commit 1, blame-ignored in commit 2)

- Replaced all **108** em dashes with contextual ASCII punctuation (comma,
  colon, semicolon, parentheses for the 7 bracketed asides, or a sentence
  split). Delegated the mechanical rewrite to a subagent, then verified
  independently.
- **Fidelity proof:** normalized word-token comparison (lowercased `\w+`)
  between old and swept is identical, 6153 == 6153; line count 650 == 650. So
  the change is punctuation-only, every invariant/rule/rationale preserved
  verbatim. Reviewed the full word-diff for grammatical sanity.
- Isolated as its own mechanical-churn commit and added its SHA to
  `.git-blame-ignore-revs` (per the Commits convention) so blame on the ~90
  touched lines points at the rule's authoring commit, not the sweep.

## Over-explanation: deliberately NOT trimmed

AGENTS.md is the normative invariants/conventions doc; its detail and rationale
are load-bearing (global rule: preserve the "why"). Cutting content there would
break the punctuation-only fidelity guarantee and risk dropping an invariant
nuance. Left the prose intact. A real content-shortening pass, if wanted, is a
separate riskier edit to do section-by-section with review. No claude-isms/fluff
were present to remove.

## Codex reviewer note (commit 3)

Promoted two session learnings into the "Automated PR reviewer: Codex" bullet:
- **A no-findings Codex review is a 👍 (`+1`) reaction on the PR**, not a
  review/comment. A watch keying only on reviews/comments misreads a clean pass
  as "no review" (this happened on #47). Also poll reactions.
- Codex only starts tracking a PR on an open / ready / `@codex review` event, so
  a PR opened on a non-`main` stacked base can be skipped until you fire one
  (toggle draft to ready). Mirrors the session memory saved this day.

## Promote-queue check

Grepped the devlog promote/deferred queue: only the pre-existing code-invariant
promotions (sha256 binding, apierr.ts, pagination) remain open, out of scope for
this style pass. Re-deferred, unchanged.
