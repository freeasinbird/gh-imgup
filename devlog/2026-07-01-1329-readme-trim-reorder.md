# README trim + reorder

Branch `docs/readme-trim-reorder`, **stacked on** `docs/codex-friendly-pinned-install`
(PR #46). Docs only, no code. User asked for a README review with two goals:
less verbose, and most-important info nearer the top.

## Findings that drove it

- **Install/usage sat ~60% down.** Order was Quick Start → Why → Primary Use Case
  (~45 lines) → Usage → How It Works → Security → Known Tradeoffs → Versioning →
  **Distribution (line 292)**. A reader wanting to adopt (gh ext / skill /
  pre-authorize) had to scroll past two motivation sections.
- **Same facts restated 3–4×:** `contents:write` breadth (Security + Known
  Tradeoffs + Design Process), `fetch()`-only (How It Works + Security + Design
  Process), zero-deps (Why + Repo Layout + Design Process), no-third-party (Why +
  Security + Design Process), pre-upload review (Security + Design Process). The
  agent workflow was described twice inside Primary Use Case. **Design Process**
  was largely a recap of Security + Tradeoffs.

## Decisions (confirmed with user)

- **Approach: trim + reorder** (over trim-only / aggressive). New order:
  Quick Start → **Installation** (npm · gh ext · skill · pre-authorize) → Usage →
  Why it exists (Why + Primary Use Case merged/condensed) → How It Works →
  **Security Model (Known Tradeoffs merged in, deduped)** → Versioning →
  Design Process (2-line pointer to `docs/design.md`) → Repo Layout · Contributing
  · License.
- **Merged Known Tradeoffs into Security Model** as a `### Tradeoffs` subsection;
  `contents:write` breadth stated once in Credential scope, cross-referenced from
  Tradeoffs (was duplicated).
- **Design Process shrunk to a pointer.** Its bullets duplicated Security/How It
  Works; unique-enough facts preserved elsewhere: SHA-256 (Upload flow step 4),
  `--tag _` constraint (Usage), and SVG-excluded folded into Upload flow step 2.
  The `gh-imgup` vs `gh-image` naming trivia dropped (lives in design.md).
- **Ship: separate stacked PR** on the #46 branch (auto-retargets to main when
  #46 merges) so the invocation-docs PR stays focused. If #46 is force-pushed
  again, `rebase --onto` this branch onto the new tip.

## Style pass (user feedback, folded in)

- **Reworded the npm opener** to lead with the zero-install option before the
  pinned recommendation: "While you can run `gh-imgup` zero-install with …, for
  repeated use … install a pinned version once …".
- **Swept em dashes** from the README (39 → 1), replacing with commas, colons,
  semicolons, parentheses, or sentence splits per the global no-em-dash rule.
  The **one kept** is inside the quoted release label `⚠️ Image assets — do not
  delete`, which must match `RELEASE_NAME` in `src/release.ts:11` verbatim;
  changing it would misquote a live code string (and the label on existing
  releases). Left the source label alone (code change, out of scope).
- No claude-isms/marketing fluff found on scan.

## Second iteration (user feedback)

Placement reconsidered after the first reorder pushed motivation below Usage:

- **Moved a trimmed `Why This Exists` up**, right after Quick Start and before
  Installation. A short motivation section reads near the top without burying
  Installation.
- **Relocated `The agent workflow` (numbered capture steps) into Usage** — it's
  usage/how-to, not motivation, and its `--pr` vs body-composition paragraph
  duplicated the Usage `Output` examples, so that trailing paragraph was dropped
  and replaced with a cross-ref to Output. This is what made Why short enough to
  lift.
- **Headings renamed for parallelism:** `Why it exists`/`How It Works` (mixed
  case, and the first was mine from the trim pass) → `Why This Exists` /
  `How This Works` (user's pick over the `gh-imgup`-named variant).
- **Quick Start agent note** now points at the pinned global install + bare-name
  pre-authorization as the smoothest agent path, not just a vague link to
  Installation.

New order: Quick Start → Why This Exists → Installation → Usage (agent workflow ·
Output · Actions) → How This Works → Security Model → Versioning → Design Process
→ Repo Layout · Contributing · License.

## Third iteration (user feedback): trim Installation over-explanation

Cut mechanics-explanation while keeping every actionable step and security
caution:

- **gh extension:** dropped the ~120-word paragraph on how `gh` decides
  source-build vs binary-download (the `<os>-<arch>` suffix / `isBinExtension`
  detail). Pure maintainer concern, already an invariant in AGENTS.md; an
  installer doesn't need it.
- **npm:** collapsed the two "Keep the `-y` / Keep the scope" bullets into one
  sentence.
- **Pre-authorize:** removed the "`-y` makes it non-interactive / allowlist makes
  it non-prompting" restatement; cut the Codex "`-y` does nothing to change
  (`-y` only suppresses npx's own prompt …)" parenthetical the user called out;
  tightened the Claude spacing-gotcha and the Codex Cloud / don't-blanket-allow
  cautions.
- **Kept** the three security points intact (form-specific allow rule; scope the
  rule / no blanket `npx *`; don't blanket-allow npx/npm-exec/unpinned scope) —
  those are substance, not over-explanation.

## Not changed

- No facts removed beyond redundancy; the invocation/pre-authorize content from
  #46 carried over verbatim (both Codex fixes included, since this branch is
  based on #46's tip `6816cb6`).
- `docs/design.md` untouched.

## Verification

- Internal anchors checked: `#installation`, `#agent-skill-claude-code-cursor-codex`,
  `#pre-authorize-for-agents`, `#security-model` all resolve to their headings.
- `npm run lint` / `typecheck` / `test` / `build` green (docs-only, CI gate).
