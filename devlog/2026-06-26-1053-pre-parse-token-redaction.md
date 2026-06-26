# Pre-parse token redaction (review P1)

Branch `fix/pre-parse-token-redaction`. First of a 6-finding review batch
(taken one PR at a time). P1: a parse/validation error thrown before
`resolveToken` ran was redacted against `token=""`, so an argument that
embedded the token leaked it to stderr. Reproduced:
`GITHUB_TOKEN=ghp_SECRET node dist/index.js --bad-ghp_SECRET` printed the
token in `Unknown option: --bad-ghp_SECRET`. Violates invariant 3 (every
error path strips credentials).

## Fix

Seed `token` from `(deps.env ?? process.env).GITHUB_TOKEN` (trimmed, matching
`resolveToken`) at the top of `run()` BEFORE `parseArgs`. `resolveToken` still
overwrites it with the authoritative token once it runs. The whole
pre-resolution window now redacts. After: `Unknown option: --bad-[REDACTED]`.

## Refute-first (credential-leak surface)

- **gh-CLI token in argv not covered** — accepted-by-decision. The pre-resolution
  seed is env-only. The gh-fallback token isn't knowable without its subprocess
  and isn't an argv-injection vector (a caller doesn't hold it as a string to
  template into args); fetching it on the error path would add a third subprocess
  call against invariant 1's "exactly two" budget. Documented in-code.
- **Over-redaction** — confirmed harmless: only error text is affected; redacting
  too much is the safe direction (invariant 3).
- **Seed matches resolveToken's env source** — confirmed: both read
  `deps.env ?? process.env` and trim, so the seeded redaction token equals the
  resolved token for the env case (no divergence window).
- **Existing encoded-token test** (`ghp%5FTOK.png`) unaffected — that error fires
  after `resolveToken`, so token was already set; still passes.

## Verification

- New regression test: `--bad-${TOKEN}` with env token, asserts stderr matches
  `/Unknown option/` and not `/ghp_TOK/`.
- `npm test` (164 → 165), `npm run lint`, `typecheck`, `format` clean. Manual
  repro confirmed redacted.

## Remaining review findings (separate PRs)

P1/P2 cleanup Link-param parsing (fail-closed); P2 rendered-token form to
upload stdout; P2 DEL/C1 filename controls; P2 npm pack build hook; P3 stale
design.md (help/wrapper). Plus open promote: invariant-4 pagination-binding
note from [[2026-06-25-1114-cleanup-pagination-binding]] — fold into the
cleanup-pagination PR (P1/P2).
