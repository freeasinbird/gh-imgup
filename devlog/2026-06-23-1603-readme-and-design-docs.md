# README + docs/ from the design sources

Turned the two authored design documents into the repo's standing docs.

## Decisions

- **README = the project-description doc, with an honest status callout.**
  The source reads as a finished-product README (working `npx gh-imgup …`
  examples), but only the scaffold exists — upload isn't implemented. Added a
  top-of-file "pre-release / in development" banner so no one assumes the CLI
  works or is published today. Kept the rest near-verbatim; it's the product
  vision and is well-written.
- **Design spec lives at `docs/design.md`** (copied near-verbatim — dropped the
  "v4" from the subtitle since it's the only design doc in the repo and the
  v1–v3 lineage isn't here; the iterative-audit provenance stays in the README's
  Design Process section). Added a short `docs/README.md` index, and linked the
  Design Process section to it instead of saying "available in the repository."
- **Appended License + Contributing sections** to the README — the License
  section is the one the license-philosopher skill deferred earlier because no
  README existed yet (GPL-3.0 + LICENSING-PHILOSOPHY.md links).
- Replaced `<owner>` placeholders with `freeasinbird` in the README's
  distribution commands; left the design doc's placeholders as-is (archival).

## Deferred

- SECURITY.md and CHANGELOG.md — separate work units (SECURITY.md is listed in
  the design's repo layout and is high-value for a security-positioned tool).
- The README still describes unimplemented behavior; the status banner is the
  honesty bridge until the upload pipeline lands. Revisit the banner when the
  CLI is functional.
