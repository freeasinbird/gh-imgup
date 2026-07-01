# Security-review fixes: entity decoding, redaction bound, helper dedup

A full project review (security / quality / enhancements) found one real
bug and a set of hardening items; this session ships the code fixes
(PR: fix/security-review-findings). CI hardening lands separately.

## Decisions

- **Entity map gets a null prototype** (S1). `&toString;` and six other
  identifier-shaped `Object.prototype` names decoded to stringified
  inherited functions. Fixed at the data structure, not per-lookup;
  regression tests pin all seven plus `__proto__` (regex-unreachable).
- **redactBody scan is bounded** (S2): collapse controls first (linear,
  printable-preserving), then window to `MAX_SCAN` (8 KiB) before the
  O(n²) fixed-point decode. Echo (500 chars) is a strict subset of the
  scan window, so the redaction decision can't be split by the cap.
  Rejected alternative: capping decode passes in `decodesToToken`
  (weakens detection at depth for every caller, not just bodies).
- **Deduped invariant-bearing helpers**: one `collapseControls`
  (markdown.ts, code-point scan — the apierr regex twin is gone),
  `refuseTokenBearingTag` and `boundGithubUrl` in validate.ts shared by
  release/github/cleanup. Kept `isUsableAssetUrl`/`usableCommentUrl`
  names and endpoint-specific checks (invariant 9 wording still holds).
- `clean` script now runs before test/prepack builds (stale compiled
  files could otherwise run in tests or ship in the tarball). Node-based
  removal, not `rm -rf`: npm scripts run under cmd.exe on Windows
  (Codex P2 on the first review pass; fixed by fold).
- SECURITY.md states symlink-following on file args as deliberate.

## Refute-first verification (credential + destructive lenses)

- **Confirmed safe by refutation**: no constructible token leak through
  the new windowing (echo ⊂ scan window; control-run pull, straddle at
  500/8192, mixed encodings all redact); `boundGithubUrl` refactor made
  0 differing decisions across ~6.3M old-vs-new comparisons; tag
  refusal byte-identical at both call sites, still before any fetch.
- **Accepted-by-decision (1)**: an encoded token *beyond* MAX_SCAN no
  longer triggers whole-body redaction; the echoed 500-char prefix was
  verified token-free and undecodable. Strictly less redaction of
  provably clean text.
- **Accepted-by-decision (2)**: bodies containing pseudo-entities
  (`&toString;` etc.) flip kept→deleted in cleanup matching. The old
  keep was a spurious artifact (GitHub renders those names literally;
  the injected function-source text was never a rendered reference);
  raw/rendered haystacks still match every real reference form, and the
  TTY confirm still lists each asset.

## Deferred / open

- `redactField` still runs the unbounded decode (statusText is
  undici-bounded; a huge JSON field from a tampered body could be
  slow). Defer: same MITM-only reachability, echo semantics differ.
- Structure findings from the review (upload.ts misnomer, ~290-line
  uploadAsset, Link parser extraction, depsOf/refetch dedup) and a
  version()-failure test: deferred, refactor-only, no invariant impact.
