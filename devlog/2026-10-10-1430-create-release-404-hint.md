# Explain a create-release 404 as a repo-access problem

`ensureRelease` (`src/release.ts`) treats a 404 on the pre-create GET
`/releases/tags/<tag>` as the normal "not created yet" signal and falls
through to `POST /repos/{owner}/{repo}/releases`. That POST can *also* 404 —
identically, from the client's point of view — when `--repo` is mistyped,
the repo doesn't exist, or the token can't see it (private repo, or, sharpest
in practice, a GitHub Actions `GITHUB_TOKEN` scoped only to its own repo used
with a cross-repo `--repo`). Before this change both cases produced the same
bare `Create release failed: 404 Not Found`, with no hint that this 404 means
something different from a transient API error.

## Decision

- **Extended `apiError`'s signature with an optional trailing
  `notFoundHint?: string`**, appended inline the same way the existing
  401/403 `scope` hint is (` (${notFoundHint})`), only when `res.status ===
  404` and the caller supplied one. Chose this over a bespoke `Error` built
  directly in `release.ts` (the spec's listed alternative) because the
  existing 422-already-exists-404 branch a few lines above already hand-rolls
  a message with its own `sanitize`/`redactBody` calls, and a second
  hand-rolled branch right next to it would duplicate `apiError`'s status/body
  formatting for no reason — `apiError` already does exactly what's needed
  once it can carry a 404 hint. The parameter defaults to `undefined`, so
  every other call site (`Look up release`, `Upload`, `Delete asset`,
  `Re-check asset`, the 422-race retry GET) is unaffected; confirmed by the
  full suite passing unmodified for all of them.
- **One new branch in `ensureRelease`**, immediately before the existing
  trailing `throw await apiError(token, created, "Create release");`: when
  `created.status === 404`, call `apiError` with a hint naming `repo.owner`/
  `repo.name` (already regex-validated by `validateRepo` to
  `[A-Za-z0-9_.-]+`, so no additional escaping is needed) and static prose
  covering all three causes (typo, nonexistent/inaccessible repo, GitHub
  Actions `GITHUB_TOKEN` scope) without claiming to distinguish between them
  — GitHub's 404 genuinely doesn't let the tool tell "doesn't exist" apart
  from "exists but no access". Every other status at that call site
  (401/403/422/500/...) still falls through to the unchanged final line.

## Redaction confirmation

The new hint parameter cannot itself carry an unredacted token: it is built
only from caller-supplied static text and `repo.owner`/`repo.name`, which are
regex-validated and never response-derived — never from `res`'s body or
`statusText`. The final message still passes through the same
`redactBody(token, await res.text())` for the body and `sanitize(token, ...)`
at the end of `apiError` as every other call, unchanged by this parameter;
the new `apierr.test.ts` case constructs a 404 response whose body embeds the
raw token and asserts the thrown message still redacts it while keeping the
hint text intact.

`npm run build`, `npm run typecheck`, `npm run lint`, and `npm test` (222
tests, including 3 new: two direct `apiError` unit tests for the
`notFoundHint` default-omitted and default-provided cases, and one
`ensureRelease` end-to-end test asserting the message names `o/r`, matches
`/typo/i`, `/access|private/i`, and `/GITHUB_TOKEN/`, and does not leak the
test token) are green.

Revisit when: GitHub ever starts distinguishing "repo doesn't exist" from
"repo exists but inaccessible" in the create-release response — at that point
the message's deliberate both-causes framing would need to change, not just
its wording.
