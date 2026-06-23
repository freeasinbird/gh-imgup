# Output formatter escapes Markdown delimiters

Second Codex P2 on PR #4 (`upload.ts`): the markdown formatter interpolated
the user-controlled filename stem straight into `![alt](url)`. A filename
can't contain `/`, but it can contain `] [ ( )` — enough to close the alt
early and inject a SECOND image with an attacker-chosen target, e.g. a file
named `x](https:evil)![y.png` renders two images. The output goes into
PR/issue comments, so this is markdown injection on a reviewer-facing
surface, not just cosmetic.

## Decision

- **Escape `\ [ ]` in alt text** (`escapeAltText`) and collapse newlines to
  spaces, so a stem can never break out of `![…]`. Backslash-escape (not
  removal) keeps the visible text intact; GFM renders `\]` as a literal `]`.
- **Angle-wrap the URL** (`markdownDestination`) only when it contains
  whitespace or `()` — GitHub asset URLs are percent-encoded and normally
  don't, so the documented bare-URL output is unchanged in the common case.
- Single chokepoint: both the default markdown output and the `--json`
  `markdown` field go through `markdownLine`, so one fix covers both. `--raw`
  emits the bare URL (no markdown context) and needs no escaping.
- Rejected: always angle-wrapping (deviates from documented examples for no
  benefit); over-escaping `* _ \`` (cosmetic, not a structural breakout).
- Test note: the reviewer's `/`-bearing example isn't a reachable filename
  (`basename` eats `/`); the regression test uses a slash-free payload.

## Promote to AGENTS.md (follow-up)

New output-contract invariant: **anything rendered into Markdown for a GitHub
surface must escape user-controlled text** (filenames today; captions when
`-m`/commenting lands). Belongs in "Architecture invariants" or "Conventions".
