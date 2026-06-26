# gh-extension release strategy: resolved by research (#14)

Branch `docs/gh-ext-release-asset-rule`. Not a code change — promotes a research
finding into AGENTS.md and closes out the #14 decision. No session work
preceded it; this records the reasoning so the rule isn't only in a closed issue.

## The question

#14 framed a fork: ship precompiled gh-extension binaries on each release
(Option A) vs. publish npm + the `_gh-imgup` prerelease only and avoid normal
GitHub Releases (Option B), because "cutting a normal Release breaks
`gh extension install`." That premise was the load-bearing claim — so I checked
it against the source instead of reasoning on top of it.

## Finding (authoritative: cli/cli source)

`gh extension install` chooses binary-vs-script via `isBinExtension`
(`pkg/cmd/extension/manager.go`, trunk). It keys on **asset names**, not on the
existence of a release: it loops the latest release's assets and sets `isBin`
only if one ends in a known `<os>-<arch>` suffix (`possibleDists()`,
`darwin-amd64`, `windows-amd64.exe`, …). Flow is **binary → script → fail**:
no matching asset ⇒ `isBin=false` ⇒ git-clone + run the root `gh-imgup` script.
GitHub's auto "Source code" tarballs aren't in `assets`, so they don't trigger
it. `gh extension upgrade` uses the same logic.

So the dilemma was false: GitHub Releases + npm + source-install extension all
coexist, as long as no attached release asset's name ends in a platform
`<os>-<arch>` suffix (any asset — `HasSuffix`-matched, no `gh-imgup-` prefix
needed).

## Decision (#14 closed completed)

- Extension stays **source-install only**; ship **no** precompiled binaries (a
  per-platform bundled Node runtime would undercut the zero-runtime-dep /
  minimal-audit-surface security model — the project's whole pitch).
- Cut normal versioned GitHub Releases freely (unblocks #16); #17 item 2's
  `release.yml` needs no binary-attach job.
- Operational rule promoted to AGENTS.md: **never attach a release asset whose
  name ends in a platform `<os>-<arch>` suffix** unless deliberately switching to
  a binary extension (a separately-reviewed change). _(Codex P2 on #28 corrected
  the first wording: `isBinExtension` `HasSuffix`-matches every asset name with
  no `gh-imgup-` prefix requirement, so the ban is on the suffix on ANY asset —
  a stray `…-linux-amd64` checksum/SBOM would trip it too, not just a binary.)_
- Aligned the user-facing README gh-extension guidance (Codex P2 on #28 — a
  contradictory README would reintroduce the very dilemma this records). The
  paragraph originally stated the refuted premise ("source-clone only while no
  published release; a normal release must ship binaries"); #29 merged
  concurrently and replaced it with a narrower-but-correct version, so on rebase
  #28 broadens that to the suffix-on-_any_-asset rule (matching the AGENTS.md
  wording), not just `gh-imgup-<os>-<arch>`. Same broadening applied to
  `docs/design.md`'s gh-extension paragraph (it said "attached binary asset" —
  too narrow; a non-binary suffixed asset trips it too). All four surfaces
  (AGENTS.md / README / design.md / this devlog) now state the rule identically.
- Consolidated a duplicate: #29 had also added a (narrower) gh-extension
  source-install bullet to AGENTS.md, so after the rebase there were two
  overlapping bullets. Removed #29's and kept the one comprehensive bullet in the
  logical spot (after "three distribution channels"). A proactive grep for the
  narrow phrasing across all docs (not just waiting for the next Codex round)
  surfaced this.
- Belt-and-suspenders before the pipeline relies on it: one empirical
  `gh extension install` check against the pinned gh version on a no-binary
  `vX.Y.Z`. Source is trunk; mechanism stable since ~gh 2.3.0, so high confidence.

Rejected: Option A (binaries) — security-surface and per-platform-build cost
inverts the trade for a security-positioned, agents/CI-first tool whose primary
channel is npm/npx.

## Out of scope (still open)

Whether to keep the gh-extension channel *at all* vs. npm + skill only — a
product-positioning call (gh-ecosystem discoverability as the secure alternative
to `gh-image`). Left undecided by owner's call; not filed as an issue.

## Verification

- Source quoted from [cli/cli `manager.go` trunk](https://raw.githubusercontent.com/cli/cli/trunk/pkg/cmd/extension/manager.go).
- Docs-only: `npm run lint` / `format` clean (no src touched); nothing to test.
