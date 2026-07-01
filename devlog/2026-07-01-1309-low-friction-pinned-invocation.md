# Pinned pre-installed binary as the low-friction agent path

Branch `docs/codex-friendly-pinned-install`. Docs/skill only, no code.

## Motivation (residual from #45)

PR #45 canonicalized `npx -y @freeasinbird/gh-imgup …` and fixed two frictions:
npx's interactive first-run hang (`-y`) and the Claude allowlist string. It
explicitly deferred "Codex has its own approval config." That residual bit: in
Codex "Approve for me" mode, the model-based approval reviewer refuses to run
npx because it (correctly) sees "download and run an *unpinned* package with
credential access." `-y` does nothing for this — it suppresses npx's own prompt,
not a separate approval gate.

## Decision

- **Add a pinned pre-installed path, don't replace npx.** `npx -y …` stays the
  zero-install canonical form; the pinned bare `gh-imgup` becomes the recommended
  low-friction path for repeat use and strict reviewers. It's also genuinely
  safer: auditable once vs. re-fetch-and-exec every run.
- **npm-global `gh-imgup` is the primary pre-installed form** (matches
  `package.json` bin and Codex's own suggested allow prefix). gh extension stays
  documented as an alternative, not promoted to primary.
- **Per-agent allowlist strings, kept in sync across README/SKILL/AGENTS:**
  Claude `Bash(gh-imgup *)`; Codex persistent prefix `["gh-imgup"]`.
- **Codex section rewritten** from "configure it separately" to concrete steps
  (pin → install trusted → narrow persistent prefix) + the *why-not* (blanket
  npx / `npm exec --package` / unpinned scope grants future downloaded code
  local-file + credential access) + a Codex Cloud note (install in env setup
  script, allow `api.github.com`/`uploads.github.com`).
- **Scope: repo docs only.** User does the one-time local install + allow rules
  themselves (Claude settings + Codex's UI approval, which an agent can't click).

## Rejected / not done

- **Relaxing Codex's global `approval_policy`/sandbox** — broad, non-portable
  across IDE/CLI/Cloud, and a worse trade than a narrow bare-name allow.
- **Making the `gh` extension the primary form** — two-token command, ties to
  `gh`; bare `gh-imgup` is the cleaner portable default.
- **Blanket `Bash(npx *)` / system-wide npx allow** — supply-chain risk; already
  cautioned in README.
- `docs/design.md` left as design history (unchanged, per #45).

## Promote-queue drain (docs-PR convention)

Grepped the devlog promote/deferred queue. The only open items are code-invariant
promotions (2026-06-24-0600 sha256 content-binding; 2026-06-24-0430 apierr.ts;
2026-06-25-1114 invariant-4 pagination binding), most already reflected in
current invariants 3/4/6. They're a code-docs concern, out of scope for this
invocation/pre-authorize change — **re-deferred**, unchanged.

## Review round (Codex, folded into the commit)

- **P2 confirmed — dropped the `["npm","exec","--","gh-imgup"]` repo-local prefix.**
  `npm exec` resolves its arg as a *package spec* using the **unscoped** bare
  name; with no local `.bin/gh-imgup` (missing dep / wrong dir) it fetches the
  different, unpinned `gh-imgup` from the registry — persistently allowlisting it
  would execute unpinned code, contradicting the supply-chain guarantee this
  section adds. Credential-leak/supply-chain surface, so verified before fixing:
  real. Global-install → bare `gh-imgup` (`["gh-imgup"]`) is the one safe
  allowlistable path; removed the devDep parenthetical that only led to the
  `npm exec` workaround. The "don't blanket-allow `npm exec --package`" caution
  stays.
- **P2 confirmed — Claude allow sample no longer grants both forms.** The JSON
  block listed `Bash(gh-imgup *)` *and* the npx rule, so a user who chose the
  pinned form to avoid approving unpinned npx would silently re-grant it by
  copy-pasting. Split: the block now shows only the recommended pinned rule; the
  npx rule is prose, opt-in, with an explicit "don't add it if you chose pinned
  to sidestep this" caution. SKILL's prose "A or B" phrasing already reads as
  either/or (no copy-paste-both hazard), so unchanged.

## Verification

- `grep` confirms the bare-name allow form (`Bash(gh-imgup *)` / `["gh-imgup"]`)
  present in README, SKILL, AGENTS; npx form still intact (additive, not removed).
- `npm run lint` / `typecheck` / `test` / `build` — docs-only change, CI gate run
  green before PR.
