# Document --cleanup's actual required scopes

`--cleanup` scans five endpoints (issues, issue comments, PR review comments,
commit comments, releases) that need `issues:read` and `pull_requests:read`
beyond the base `contents:write` upload scope; `contents:read` for commit
comments/releases is already implied by a fine-grained PAT's "Contents: write"
permission. README.md, SECURITY.md, and skills/gh-imgup/SKILL.md previously
stated only `contents:write` (+ `issues:write` for `--pr`/`--issue`), which
under-documents what a token needs to run `--cleanup` without a permission
error partway through the scan.

## Decision

Added `issues:read` + `pull_requests:read` to each existing scope mention
(README Quick Start, Authentication, Credential scope; SECURITY.md "Scope the
token"; SKILL.md Auth), conditioned on `--cleanup`, rather than widening the
baseline scope recommendation for upload-only use.

## Verification

- `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`
- Grepped each updated doc location for the `issues:read`/`pull_requests:read`
  pair to confirm the addition landed in all four files.
