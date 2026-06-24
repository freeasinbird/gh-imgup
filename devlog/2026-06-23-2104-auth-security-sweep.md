# Proactive security sweep of auth.ts

After the third Codex P2 on auth.ts, ran a self-initiated 4-lens adversarial
review (+ per-finding verify, default-refute) to get ahead of round four.
8 raw findings → 3 confirmed = 2 distinct issues.

## Fixed

- **P3 security — redirect-following escaped the host allowlist.** authedFetch
  validated only the initial URL, then called fetch with the default
  `redirect: "follow"`, so a 3xx from an allowed host would transparently
  contact an off-allowlist host — defeating invariant 4 on the very chokepoint
  that claims to enforce it. The token is NOT leaked (undici strips
  Authorization cross-origin), so it's a *destination* gap, not a token leak.
  Fix: force `redirect: "error"` after the spread (fail loud; a caller can't
  re-enable auto-follow; the 3xx rejects into the sanitizing catch). None of our
  operations (create/get release, upload asset, comment) need a client-followed
  redirect; a future one would re-validate the Location host explicitly.

## Accepted as-is (not a bug to fix)

- **P3 robustness — a hung `gh` (ETIMEDOUT > 5s) reports "No GitHub token
  found".** Deliberately left: the catch-all collapse is by design
  ([[2026-06-23-2036-auth-token-and-fetch]]); no security/correctness impact (no
  token is returned either way; stderr is discarded so nothing leaks); and a fix
  adds essentially untestable subprocess-timeout I/O for marginal diagnosability.
  Recorded so it's a decision, not an oversight.

Verification rejected the other 5 raw findings (host/port handling deemed
intended; no referrer-policy concern for a programmatic fetch; etc.).

## Promote to AGENTS.md (follow-up)

Invariant 4 should add **"no client-followed redirects"** alongside the
HTTPS-only note already queued.
