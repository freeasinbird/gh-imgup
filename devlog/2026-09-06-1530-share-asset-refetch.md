# Share the asset-by-id re-fetch primitive (release.ts + cleanup.ts)

`verifiedDelete` (`src/release.ts`) and `idStillHostsUrl` (`src/cleanup.ts`)
each inlined the same GET+parse steps for `releases/assets/{id}` — URL
construction, a try/catch around `authedFetch`, the `status !== 200`
short-circuit, and `.json().catch(() => null)` — before applying their own,
intentionally different, acceptance rule on the result (URL-only +
`isUsableAssetUrl` for the upload path; URL+name, no shape check, for
cleanup).

## Decision

- **Extract the GET+parse step only, as `fetchAssetById` in `src/release.ts`.**
  It returns the parsed body (or `null` on throw/non-200/unparseable body) and
  makes no acceptance decision. `cleanup.ts` already imports `deleteAsset`,
  `isUsableAssetUrl`, and `releaseId` from `./release.js`, so adding one more
  ~15-line function to that import keeps the existing dependency direction
  (`cleanup.ts` -> `release.ts`) rather than introducing a new module for a
  single shared step.
- **Keep the two acceptance policies separate.** `verifiedDelete` still checks
  `isUsableAssetUrl(gotUrl, repo, tag) && gotUrl === expectedUrl`;
  `idStillHostsUrl` still checks `browser_download_url === asset.url && name
  === asset.name`, no shape validation. A `got === null` result already makes
  `gotUrl` (or `got?.browser_download_url`) `undefined`, and
  `isUsableAssetUrl(undefined, …)` is `false` per `boundGithubUrl`'s
  `typeof value !== "string"` guard, so neither caller needs a separate
  `null`-handling branch.
- **Rejected: a single `assetIdMatches(...)` boolean helper.** Folding both
  checks into one function would flatten two intentionally different safety
  policies (a shape-validated re-bind for a destructive delete after upload
  vs. a plain field-equality re-bind before a cleanup delete) into one,
  contradicting the issue's explicit goal of keeping them distinct. Sharing
  only the GET+parse step, not the acceptance rule, avoids that.

## Refute-first verification (destructive-path, returned-object trust boundary)

Both callers gate a destructive `DELETE` on the shape of an API response, so
this is on the mandatory-note list.

- **Diff of the moved lines.** The GET+parse block moved into `fetchAssetById`
  is a verbatim reproduction of the pre-change inline code in both callers
  (same URL template, same try/catch scope — only around the `authedFetch`
  call, same `res.status !== 200` check, same `res.json().catch(() => null)`
  parse). No decision logic changed in either caller; `verifiedDelete` and
  `idStillHostsUrl` still perform exactly the equality/shape checks they did
  before, just against `fetchAssetById`'s return value instead of an inline
  `got`.
- **Old-vs-new corpus comparison.** Reconstructed the pre-change
  `verifiedDelete`/`idStillHostsUrl` GET+parse-and-decide logic verbatim in a
  scratch ES module, imported the compiled post-change `dist/release.js`
  (`fetchAssetById`, `isUsableAssetUrl`), and ran both decision functions over
  a corpus crossing {fetch throws; status 404; status 500; status 200} x
  {unparseable body; `null`; `{}`; missing `browser_download_url`;
  `browser_download_url` non-string (number, `null`, array, object);
  `browser_download_url` well-formed but wrong-target (different repo, and a
  same-repo URL with a disallowed query); `browser_download_url` exactly the
  expected URL} x, for `idStillHostsUrl` only, {`name` exact match, missing,
  wrong-typed, mismatched}. 85 comparisons across the two functions.
  **Result: 0/85 divergences.** Scratch harness discarded per the issue's
  fallback (not committed); this note is the durable record of method and
  result.
- **Dispositions**: no findings surfaced by this pass; nothing to accept or
  reject.

Revisit when: a third caller needs the same GET+parse step with yet another
acceptance policy — that would confirm `fetchAssetById`'s boundary is drawn in
the right place — or when either acceptance policy needs to change in a way
that suggests they were never as different as this decision assumed.
