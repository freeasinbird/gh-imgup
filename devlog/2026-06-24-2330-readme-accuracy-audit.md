# README accuracy + honesty audit

Branch `docs/readme-accuracy` (stacked on `feat/distribution-channels` so it has
that PR's README state; retargets to main when #10 merges). Maintainer asked to
audit every README claim — no over-promising, over-stating, or misrepresenting,
and stop pushing the tool.

## Decisions

- **Audited every claim against src/** (3-lens workflow). Two commits, split by
  concern: factual corrections, then tone/de-pushing.
- **Factual fixes:** stale status block (pipeline IS implemented; only "not
  published" remained true); `--json` is a JSON array incl. `repo`, not a bare
  object; `GITHUB_TOKEN` is optional (gh fallback), not "Required"; "single API
  call" → the requests it makes; "exactly two subprocess calls" scoped to the
  compiled CLI (wrapper noted); repo layout missing apierr.ts; "~400 lines / 7
  files" → ~2,400 lines / 8 files; MIME now lists .jpeg; npm marked not-yet-
  published (dropped fictional @1.0.0); Actions example needs published pkg or a
  source build; unverified `npx skills add` → copy SKILL.md.
- **Tone:** removed "fundamental flaw" / "info-stealer malware" framing and
  marketing ("every frontend team wants this", "eliminates that friction",
  "works today with Claude Code, Codex"); attributed competitor claims to the
  design-time review with an "only the gh-imgup column is verifiable" caveat;
  "Stolen browser cookie" → "Browser session cookie".
- **Kept, not removed:** the competitor comparison stays (softened + attributed)
  rather than deleted — it's legitimate design rationale. Easy to cut further if
  the maintainer prefers.

## Verification

Every corrected claim re-checked against src/ (upload.ts render() = JSON array
with repo; auth.ts resolveToken gh fallback; `wc -l src/*.ts` non-test = 2,418
across 8 files). `npm view gh-imgup` → 404 (confirms unpublished). README is
docs-only; build/lint/test unaffected (last green: 147).

## Review follow-ups

- **Maintainer chose to TRIM the comparison, not just soften it.** Removed the
  comparison table and the named-competitor critiques; kept a short neutral
  "why release assets / same-repo + scoped token" rationale that points to
  docs/design.md for the security analysis of alternatives.
- **`npx skills` is real after all** (vercel-labs/skills — `npm view skills`
  confirms; `npx skills --help` shows `add` and `update`/`upgrade`). My audit was
  over-conservative removing `npx skills add`; restored it and documented the
  `update` path the maintainer asked about, with the caveat that `add` reads the
  default branch so it works once the skill is merged there.
- **Source-build commands** in the README used bare `npm ci`, which skips the
  `typescript` devDep under `omit=dev` (same fix already applied to the
  gh-extension section); now `npm ci --include=dev` everywhere.
- Scoped the CHANGELOG subprocess claim to the compiled CLI too (on PR #10),
  matching SECURITY.md/README; #11 rebased onto the updated base.
- The source-build fallbacks said `node dist/index.js …` without noting that
  `resolveRepo()` infers the target from the cwd's git origin — run from the
  gh-imgup checkout, `--pr 42` would point at freeasinbird/gh-imgup. Both notes
  now tell users to pass `--repo` (`--repo ${{ github.repository }}` in CI).

## Note

This overlaps the deferred "docs/AGENTS.md cleanup" stage — the README half is
now done; AGENTS.md invariant-promotions remain for that stage.
