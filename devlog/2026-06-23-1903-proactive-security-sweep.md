# Proactive security sweep of validator/formatter surface

After four reactive Codex P2 rounds all clustered on parseGitRemoteUrl /
the output formatter, ran a self-initiated multi-lens adversarial review
(5 lenses + per-finding verification, default-refute) to get ahead of the
loop. 6 real issues (deduped from 9 confirmed), all fixed + tested.

## Fixed

- **P2 security — redactRemote credential tail leak.** The `[^/@]+` userinfo
  class stopped at the first `@`/`/`, so a credential containing either was
  echoed in the parse-error. Now: parseable URLs drop username/password via the
  URL parser (precise, no over-masking of a path `@`); scp/malformed forms fall
  back to masking up to the LAST `@`. Generalizes the earlier redaction fix.
- **P3 correctness — host case-sensitivity.** URL lowercases http(s) hosts but
  not ssh:/git:/scp, so `git@GitHub.com:o/r` was wrongly rejected. Compare
  `host.toLowerCase()`.
- **nit** — control chars (tab, U+2028/9) survived into alt text → collapse
  them (needs a `biome-ignore noControlCharactersInRegex`; the match is the
  point).
- **nit** — validateRepo accepted a `.git` component → reject it.
- **nit** — validateMaxSize accepted `0x10`/`1e3`/`+5` via `Number()` unlike
  validateNumber → require a plain decimal.
- **nit** — altText doc comment claimed a hex-strip it never did → corrected.

## Rejected by verification (do not re-raise)

`<` in alt text (GFM/CDN neutralize it; not a breakout) and a `>` "defeating"
the URL angle-wrap (CommonMark just terminates the destination — no injection).

## Notes

- Tooling gremlin: authoring a regex control-char class via the editor kept
  inserting literal control bytes; fixed deterministically with node scripts +
  byte audits. Use that approach for control-char regex edits.
- AGENTS.md follow-up still open: generalize invariant 3 to "no credential
  leaks in error output (incl. git-remote userinfo)". See [[2026-06-23-1818-redact-remote-credentials]].
