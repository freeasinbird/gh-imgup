# Preflight, validation, and docs cleanup

Branch `fix/preflight-validation-docs`. Follow-up from the full project review:
P3 items covered raw URL echoing from `authedFetch` preflight failures, the
validation stat-to-read memory race, stale design-doc claims, and the known
Biome regex info. Split into one concern per commit (see Commit structure).

## Decisions

- `authedFetch` preflight failures no longer echo the raw URL (and `new URL`
  is wrapped, so its `TypeError` can't leak the URL either). The URL is
  response/user-derived and can carry an encoded token; the operation context is
  enough for diagnosis.
- `validateImageFile` now hashes through a bounded 64 KiB buffer and rejects if
  the file changes size during validation. This keeps the synchronous API while
  removing the whole-file read from validation.
- Updated `docs/design.md` to match current JSON/raw output, cleanup scan scope,
  source-file surface, and the structural remote parser.
- The Biome regex cleanup now rides with the Markdown extraction (it lands on
  the moved `unescapeMarkdownBackslash`); see [[2026-06-25-1144-issue-15-cleanups]].

## Refute-first review

- Credential leak: confirmed the old preflight messages could include
  `ghp%5FTOK` before the sanitized network-error catch. Rejected importing
  `decodesToToken` into `auth.ts` because `apierr.ts` already imports `auth.ts`;
  not echoing the raw URL is simpler and safer.
- Validation race: rejected another stat-only check because it still leaves a
  stat-to-read window; bounded chunking only ever reads one small buffer ahead.
- Docs: kept `docs/design.md` as a current design document instead of declaring
  the stale sections historical.

## Commit structure

One concern per commit (PR review feedback): preflight redaction, bounded
validation hashing, and the design-doc refresh are now separate commits; the
Markdown move is its own mechanical commit (blame-ignored) with direct tests.

## Verification

- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`
- `npm run format` (no fixes applied after final edits)
