# Warn on --message without --pr/--issue

Branch `fix/message-without-target-warning`. Small UX fix surfaced during the
#29 review and confirmed harmless during the live e2e test: `-m/--message` is
only consumed on the comment path (index.ts, inside `if (commentNumber !==
undefined)`), so on an upload-only run it was silently dropped.

## Decision

Warn on stderr, don't fail. The upload still succeeds and produces valid
machine stdout — dropping a caption isn't a correctness/data issue, and the
preferred body-composition flow (run upload-only, compose the body yourself)
legitimately doesn't use `-m`. Erroring would block a defensively-passed `-m`.
Message text is NOT echoed in the warning, so there's nothing to sanitize.

- Warning: `⚠ Ignoring --message: it only captions a --pr/--issue comment, and
  neither was given.` (stderr; stdout stays machine-only).
- Fires once, after token/repo/number resolution and before file validation.

## Verification

- New test: `-m` without `--pr`/`--issue` → exit 0, markdown on stdout, warning
  on stderr, no comment posted. Added a `doesNotMatch` guard to the `--pr` test
  so the warning doesn't fire when a target IS given (164 → 165 → ... +1).
- Real run confirms the warning then non-fatal continuation.
- `npm test`, lint, typecheck, format clean. CHANGELOG `[Unreleased]` note added.
