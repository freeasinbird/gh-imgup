# authedFetch: HTTPS-only + robust header merge

Two Codex P2s on PR #5, both real, both in authedFetch request construction.

## Fixed

- **Security — require HTTPS before attaching the token.** The guard checked
  only `new URL(url).host`, so `http://api.github.com/…` passed and the bearer
  token would go out in cleartext on the initial request (before any
  redirect-to-HTTPS). Now reject any `protocol !== "https:"` first. Note this is
  distinct from parseGitRemoteUrl allowing `http:`/`git:` — that path only parses
  a repo *identity*; authedFetch is the actual credentialed network call.
- **Correctness — normalize HeadersInit.** `{...init.headers}` only copies a
  plain object; a `new Headers(...)` or tuple-array silently dropped entries, so
  the upload's `Content-Type` could vanish. Build `new Headers(init.headers)`,
  add Accept/version if absent, and always set Authorization ourselves (the
  chokepoint owns it; a caller can't override or spoof it).

## Promote to AGENTS.md (follow-up)

Invariant 4 ("no third-party network destinations") should also state
**HTTPS-only** — the token must never traverse plaintext, even to an allowed
host. Add alongside the credential-redaction generalization already queued.
