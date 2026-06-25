# --cleanup: interactive orphan-asset removal

Build stage 6 (branch `feat/cleanup-orphans`): the `--cleanup` command, on the
end-to-end CLI.

## Decisions

- **Scan five repo-wide surfaces, not just bodies/comments.** Per the earlier
  owner-approved discussion: issue/PR bodies, conversation comments, inline PR
  review comments, commit comments, and release notes — all repo-wide paginated
  endpoints, no per-issue N+1. Match each asset's `browser_download_url`/name.
- **Fail-safe is the central invariant.** Any non-200, non-array page, malformed
  asset, or scan/pagination error aborts BEFORE the delete loop. Matching only
  ever yields a false "referenced" (keep), never a false "unreferenced" (delete).
  An orphan is acceptable; a deleted live image is not.
- **Interactive, no --yes, refuse on non-TTY** (decision #3). The prompt discloses
  what the scan does NOT cover so a human decides with the gaps in view.
- **PR review SUMMARY bodies: disclosed, not scanned.** They're a per-PR N+1
  (`/pulls/{n}/reviews`), marginal for the screenshot use case — deferred per the
  earlier discussion, but the gap is now named in the prompt (the sweep caught
  that an *undisclosed* gap is a false-negative/data-loss risk).
- **Extracted API/UPLOADS/repoPath into auth.ts** — cleanup is the 3rd consumer
  (rule of three, pre-committed in the github devlog). auth.ts already owns the
  host allowlist, so the URL basics live there; release/github rewired.
- **Interactivity vs the buffered run() model.** cleanup does live stderr I/O +
  reads stdin (readline/promises); index.ts's --cleanup branch uses a live warn
  and injectable isTTY/confirm, separate from the upload path's buffered CliResult.

## Verification

128 tests. A 5-lens adversarial sweep (fail-safe, match-correctness, token-leak,
invariants, interactivity+refactor) confirmed 5 findings collapsing to two: the
asset-name echo used literal sanitize only (encoded-token / control-char leak →
fixed with redactField), and the review-summary-body gap was undisclosed (→ added
to the scope note). Both fixed before commit. (Workflow gotcha: a backtick inside
a backtick-delimited lens prompt broke the script; fixed and re-ran.)

PR review caught three upload-path guards cleanup had skipped, all now matched:
- accepted ANY release with a numeric id → reuse `releaseId()` (exported): must
  be THIS tag + a non-draft prerelease before listing/deleting.
- no token-bearing `--tag` refusal → added `tag.includes(token)` guard before
  the lookup (the tag goes in the request path; a token can't be redacted from
  an identifier), mirroring ensureRelease.
- trusted any string `browser_download_url` as the match key → validate each via
  `isUsableAssetUrl()` (exported) against repo+tag; a stale/off-repo/wrong-tag
  URL aborts (fail-safe) instead of becoming a bad key that deletes a live asset.
- deleted by the list entry's id without re-confirming it (a mismatched entry
  could pair our unreferenced URL with another asset's id) → before each DELETE,
  re-fetch the asset by id and confirm it still hosts the matched URL, else skip
  — the cleanup analog of uploadAsset's verifiedDelete.
- matched references against the RAW body only → a reference written with
  entities/backslash escapes (`shot&#45;hex.png`, `shot\-hex.png`) renders to the
  real link but was missed (would delete a live asset). Now matches the body both
  raw and as GitHub renders it, via `renderInlineMarkdown` (extracted+exported
  from github.ts — same normalization the comment token guard uses).
- `renderInlineMarkdown` decoded only numeric refs + `lowbar`/`UnderBar` → a
  named entity (`shot-abc12345&period;png`) still rendered to the real link but
  was missed. Now decodes the full ASCII-punctuation named-entity set
  (`NAMED_ASCII_ENTITIES`); since our content is ASCII, numeric + those names are
  every entity form that can render to a char we match. Over-decoding only ever
  over-keeps (fail-safe). Strengthens both cleanup matching and the comment token
  guard, which share `renderInlineMarkdown`.
- a non-ASCII asset name can be referenced via a NAMED entity (`caf&eacute;.png`)
  that `renderInlineMarkdown` doesn't decode (the map is the ASCII-expansion set,
  not the full ~2000-entry table) → missed → deletable. Decision: DON'T embed the
  full named table (a ~40KB blob is at odds with the tool's minimal/auditable/
  small-surface ethos for a rare edge — the literal/numeric/percent forms are
  already matched). Instead cleanup now refuses to delete any asset whose NAME is
  non-ASCII, keeps it, and reports it for manual `gh release delete-asset`. This
  is strictly fail-safe (fewer deletions), closes the whole non-ASCII class (not
  just named entities), and is the reviewer's explicitly-offered alternative. The
  human can opt for the full table later if auto-cleaning non-ASCII orphans is
  wanted. (Gotcha: the `\x00-\x7f` regex got escape-mangled by the editor into
  `[^ -]`; rewrote isNonAscii as a `codePointAt(0) > 0x7f` scan, no escapes.)
- the first percent-fold only decoded ASCII escapes (≤0x7F), so a non-ASCII asset
  (`café-<hex>.png`, URL `caf%C3%A9-…`) linked with lowercase UTF-8 escapes
  (`caf%c3%a9-…`) was still missed → deletable. Names aren't ASCII-constrained
  (validate.ts has no stem allowlist), so this is real. `percentDecodeAscii`
  became `percentDecode`: it now decodes maximal escape RUNS via
  `decodeURIComponent` (case-insensitive, multi-byte UTF-8), tolerant of invalid
  runs (left as-is, no throw). Still single-level + monotone (raw/rendered
  haystacks intact), so strictly fail-safe.
- reference matching was byte-exact `includes`, so a body linking an asset with
  an equivalent-but-not-identical percent-encoding (canonical `%5B` vs lowercase
  `%5b`, or the literal `[`) was missed and the live asset deleted. Matching now
  folds each body into four haystacks — raw, rendered, and each percent-decoded
  (ASCII `%XX`, case-insensitive, single-pass to mirror GitHub's one-level path
  decode) — and keeps on any url/name hit. The change is strictly monotone (the
  original raw+rendered haystacks remain), so it can only ever keep MORE assets,
  never delete more. A refutation pass confirmed fail-safety and found no other
  realistic missed-reference gap (GitHub's URL always carries the final segment,
  which decodes to name; it doesn't entity-decode paths, so cross-encoding orders
  resolve to different assets, not ours).
- the non-TTY refusal told users to "delete manually with `gh release delete`" —
  but that deletes the WHOLE release (every still-referenced image). Now points
  at the per-asset `gh release delete-asset <tag> <asset-name>` and warns off the
  whole-release command. (Distinct from the AGENTS.md note that whole-release
  deletion is left to manual `gh release delete` — that's a different operation.)
- `name` was accepted independently of `browser_download_url` and used as a match
  key while the pre-delete re-fetch checked only the URL; a stale/tampered page
  pairing live asset A's id+URL with B's name could miss a filename reference to A
  and delete it. listAssets now binds the two (`decodeURIComponent(url's final
  segment) === name`, abort on mismatch) at ingestion, and idStillHostsUrl
  re-compares the refetched name too. Used decodeURIComponent, not a raw segment
  compare: GitHub URL-encodes the name into the path (a space -> %20), and a raw
  compare would false-abort on legitimately-named assets (validate.ts puts no
  charset allowlist on the stem). A 2-lens sweep caught that raw-compare bug
  (major, fail-safe but feature-breaking); a follow-up refutation pass confirmed
  the decode form is data-loss-safe and never false-aborts on real GitHub data.
- the named-entity map was hand-picked (ASCII punctuation only) and still
  incomplete — it missed the multi-char ligature `&fjlig;` -> "fj" (a URL like
  `&fjlig;ord-<hex>.png` renders to the real link), and it wrongly mapped
  `&tilde;` to ASCII `~` (it's U+02DC). Replaced it with the COMPLETE set derived
  from WHATWG `entities.json`: every `;`-terminated named ref whose expansion is
  all-ASCII (46 entries incl. aliases + `fjlig`). Closes the class instead of
  whack-a-mole; over-decoding stays fail-safe. Strengthens cleanup matching and
  the shared comment token guard (a token spelled with `&fjlig;` is now caught).
- `--cleanup` ran before upload-arg validation and silently ignored positional
  files / upload-only flags, so a stray `--cleanup` on an intended upload (e.g.
  `gh-imgup shot.png --cleanup`) would start the destructive flow. Now rejects
  any upload-only input (files, --pr/--issue/--message/--json/--raw/--max-size)
  before any token/network work; only --repo/--tag carry over. Fail-fast.
- `scanReferences` silently skipped a page item whose `body` wasn't a string,
  treating a malformed/truncated item as empty — asymmetric with `listAssets`,
  which aborts on a malformed entry. A reference hidden in the unseen body could
  then let a live asset be deleted. Now fails closed: a body must be a string
  (blank comes as `""` or `null`); a missing body, non-string-non-null value, or
  non-object item aborts before the delete loop. A 3-lens adversarial sweep (all
  not-refuted) confirmed it closes the data-loss path without rejecting any real
  GitHub shape (~1400 live items sampled: `body` always present, blanks only
  `null`/`""`) and that reverting the guard makes the code delete a live orphan
  on a `{body:123}` item.

## To promote to AGENTS.md (accumulating, docs cleanup PR)

- cleanup's scan scope + fail-safe/interactive/no-`--yes` posture as an invariant.
- Still pending from prior stages: generalize invariant 3 to encoded forms +
  control-char stripping across all output paths; the validate→upload content
  binding; the github.ts `noUselessEscapeInRegex` lint nit.
