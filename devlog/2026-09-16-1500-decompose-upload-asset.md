# Decompose uploadAsset into focused verification steps

`uploadAsset` (`src/release.ts`) owned filename token-leak guarding, file
re-stat/re-read/content binding, upload request construction, success-body
parsing, response URL binding, MIME/state validation, digest/size integrity
verification, rejected-asset cleanup, warnings, errors, and result
construction, all in one ~285-line function. The ordering is
security-sensitive (each check gates whether a created asset gets cleaned up
and whether an error or a success is returned), so keeping every step in one
function made both the ordering and each validation decision hard to review.

## Decision

- **Six private helpers, in call order:** `guardFilename` (token-leak guard
  on the filename, pre-I/O), `readValidatedFile` (TOCTOU re-stat/re-read/
  digest re-check), `postAssetUpload` (POST + success-body parse + asset-id
  validation), `bindResponseUrl` (URL usability/hex/token-leak binding),
  `rejectInvalidAssetShape` (content_type/state, cleans up and throws on
  mismatch), and `verifyIntegrity` (digest/size verification, cleans up and
  throws on mismatch, returns the canonical `UploadResult.digest` value).
  `uploadAsset` itself is now a ~45-line orchestration function that calls
  each in the same order as before and assembles the result.
- **Kept `rejectInvalidAssetShape` and `verifyIntegrity` separate** rather
  than one combined "validate the asset" helper, matching the issue's
  explicit preference for concrete, single-purpose helpers over a generic
  validator: one rejects a structurally wrong asset (content_type/state), the
  other verifies content integrity (digest/size).
- **All six helpers stay private** (not exported): the existing black-box
  `uploadAsset` tests in `src/release.test.ts` already cover every branch, so
  no helper needed its own direct unit tests per the issue's optional clause.
- **Reused `leaksToken`, `fetchAssetById`, `verifiedDelete`, `bestEffortDelete`,
  `isUsableAssetUrl`, `safeFilename`, `apiIoDefaults` unchanged** — this issue
  only extracts functions from `uploadAsset`'s body; it doesn't touch or
  redesign any of the two sibling extractions (`fetchAssetById`,
  `leaksToken`) that #77/#78 already centralized.
- **`RawUploadAsset` is a new private interface** (id/browser_download_url/
  digest/size/content_type/state, all `unknown` except a validated `id`) that
  replaces the inline anonymous type the 201 body was cast to; it exists so
  `postAssetUpload`'s return type expresses "id is now a validated positive
  safe integer, everything else is still unknown" without changing what any
  downstream check actually validates.

## Refute-first verification (credential-leak surface, returned-object trust boundary)

`uploadAsset` gates a destructive `DELETE` and a credential-leak refusal on
the shape of an API response, so this is on the mandatory-note list. Followed
the method in `devlog/2026-09-06-1530-share-asset-refetch.md` and
`devlog/2026-09-07-1600-share-token-leak-guard.md`:

- **Reconstructed pre-change `uploadAsset`** via `git show HEAD:src/release.ts`
  (the base commit for this work, `c248308`) into a scratch copy of the repo
  (`old/`), and built the post-change tree into a second scratch copy
  (`new/`) — both compiled with the project's own `tsconfig.json`, both
  importing every other module (auth, apierr, deps, markdown, output,
  validate) unchanged, so only `release.ts`'s decomposition differs between
  the two compiled `dist/release.js` outputs.
- **Corpus:** crossed 201-body-shape variants (id: valid/missing/zero/
  negative/float/string/null; download URL: usable/case-insensitive-owner/
  off-repo/wrong-tag/wrong-hex/malformed/with-query/token-leaking-encoded/
  non-string/undefined; content_type: matching/mismatching/absent; state:
  uploaded/other/absent; digest: absent/null/valid-matching/
  valid-matching-uppercase-prefix/valid-mismatching/empty-string/non-string/
  malformed-short/malformed-non-hex; size: matching/mismatching/absent/
  non-number) one-factor-at-a-time from a happy-path baseline, plus full
  pairwise crosses of the three interacting pairs (id×url, content_type×
  state, digest×size), against 2 local-file states (normal,
  changed-after-validation-same-length) and 4 bonus single-purpose cases
  (non-201 status, unparseable body, token-leaking filename, missing file).
  Ran both the reconstructed-old and the decomposed-new `uploadAsset` over
  every combination with a scripted `fetchImpl` (recording every request) and
  a captured `warn`, diffing thrown/not-thrown, error message text,
  `result` fields, warn-call text, and the sequence of request methods (to
  catch a `verifiedDelete`/`deleteAsset` invocation difference). The
  per-call random asset-name hex (`safeFilename`) was normalized out of the
  comparison since it's expected to differ between the two independent
  module instances' `randomUUID()` calls.
- **Result: 0/259 divergences.** An outcome tally over the corpus confirmed
  real branch coverage, not just uniform short-circuiting: 21 successes,
  68 missing-id, 8 unusable-url, 4 mime-mismatch, 3 bad-state, 4
  size-mismatch, 20 integrity-failed, 129 changed-after-validation (the file
  re-validation short-circuit, hit by every body-shape case crossed with the
  tampered-file state), 1 read-failed, 1 api-error. Scratch harness discarded
  per the issue's fallback (not committed); this note is the durable record
  of method and result.
- **Dispositions:** no findings surfaced by this pass; nothing to accept or
  reject.

`npm run lint` could not run to completion in this environment: `biome
check .` fails with a pre-existing, unrelated `Permission denied` error
walking `.freeside-evidence/.control` (confirmed by reproducing the identical
failure on the unmodified base commit). `npx biome check src/release.ts`
passes directly. `npm run typecheck` (`tsc --noEmit`) and `npm test` (`node
--test`, 204 tests, the same count as before this change) are green.

Revisit when: a seventh decision boundary needs to be pulled out of
`uploadAsset` (would confirm the six-helper split was the right granularity),
or when `rejectInvalidAssetShape`/`verifyIntegrity` are asked to share more
logic in a way that suggests they were never as separable as this decision
assumed.
