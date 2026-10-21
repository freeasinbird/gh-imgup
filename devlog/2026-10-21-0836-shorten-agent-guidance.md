# Shorten Project Guidance Without Changing Its Rules

For [#139](https://github.com/freeasinbird/gh-imgup/issues/139), the owner asked
to shorten project-specific AGENTS.md text while preserving project behavior.

Chose in-place compression over moving security or release rules into new
reference documents. The managed workflow, High-assurance profile, architecture
invariants, reviewer/forge/landing records, and project done checks remain
verbatim. Their exact qualifiers and fields govern decisions or feed tools;
shortening them offers less value than shortening surrounding explanations.

The [earlier style pass](2026-07-01-1456-agents-md-style-sweep.md) kept all
rationale because it was a punctuation-only edit. This separate content pass
removes incident narratives and repeated descriptions while keeping each
current rule and the reason needed to apply it. Release incidents remain in
[the release-process note](2026-07-01-1713-release-process-gaps.md) and
[the lockfile note](2026-06-26-1724-lockfile-sync.md). The asset-suffix research
remains in [its decision note](2026-06-26-1212-gh-extension-release-asset-rule.md).

Kept canonical invocation and allowlist forms, approval-mode caveats, packaging
controls, and pre-upload image review inline. The existing README approval
section supplies setup snippets and constraints, with an explicit read trigger
before configuring approvals or editing that guidance. Historical notes remain
evidence; they do not replace current instructions.

Revisit when: further shortening would require moving a rule out of AGENTS.md,
or a referenced section stops carrying the guidance this file points to.
