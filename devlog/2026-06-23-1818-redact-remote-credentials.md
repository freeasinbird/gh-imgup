# Redact credentials from remote parse errors

Fourth Codex P2 on PR #4 (`validate.ts`): `parseGitRemoteUrl`'s failure
error embedded the raw `remote`. Since the remote comes from
`git remote get-url origin`, it can carry credentials in userinfo —
`https://x-access-token:TOKEN@host/o/r` is exactly what GitHub Actions'
checkout configures — so echoing it on a parse failure leaks the secret to
stderr / CI logs / agent context.

## Decision

- Add `redactRemote()`: replace the `user[:pass]@` userinfo after `://` or
  at the start (scp form) with `***@`, then interpolate that into the error.
  A string-level redaction (not URL-parse) so it works on the malformed /
  non-URL inputs that reach the error path.
- The valid-github.com path is unaffected: it returns `{owner, name}` only,
  never the URL, so a credentialed but valid origin never propagates a token.
- This is distinct from invariant 3's API-token redaction (auth.ts,
  `replaceAll(token, …)`): the leaking secret here is embedded in the git
  remote, not the resolved GITHUB_TOKEN, and auth isn't on this code path.

## Promote to AGENTS.md (follow-up)

Generalize invariant 3 from "the token never leaks" to **"no credential
leaks in error output"** — explicitly including credentials embedded in git
remote URLs, not just the resolved API token. Same follow-up commit can fix
the design.md `parseGitRemoteUrl` snippet, now superseded across four
review-driven hardenings (host structure, scheme allowlist, cred redaction).
