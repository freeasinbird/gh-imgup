# Cleanup pagination binding

Branch `fix/cleanup-pagination-binding`. From the full-project review: P1 found
`--cleanup` followed any `Link: rel=next` URL `authedFetch` allowed, so a
response could move the scan to another repo/endpoint on `api.github.com` and
make cleanup delete an asset whose real reference was never scanned. The fix
binds pagination to the surface we started scanning; refined over several
review passes (GitHub PR Codex + a local Codex review) into the shape below.

## What the binding checks (nextLink)

Before following a `rel=next`, require all of:

- Same protocol/host; no userinfo, no fragment.
- Same repo + same endpoint beneath it, via `splitRepoPath`. GitHub rewrites
  the requested `/repos/{owner}/{repo}/…` path to the numeric
  `/repositories/{id}/…` form in Link headers, so accept that rewrite — but
  bind the id to THIS repo's id (resolved once up front via
  `GET /repos/{owner}/{repo}` → `.id`, fail closed if absent). A different
  named repo or a different endpoint is rejected.
- Original (non-pagination) query preserved exactly — a dropped `state=all`
  would silently narrow the scan.
- Page advances by exactly one (contiguous). Forward-only wasn't enough: a
  page-1 link jumping to `page=999` would skip pages 2-998 and still look
  complete.

## Key correction

The first implementation compared the next URL's pathname and query for exact
equality with the start URL. Verified live: GitHub's `rel=next` uses the
numeric `/repositories/{id}` path AND adds an `after` cursor on the issues
list. Exact comparison would abort every multi-page scan (fail-safe but the
feature never completes). Hence the repo-form-agnostic + cursor-tolerant
binding above.

## Decisions / rejected

- Rejected "host allowlist is enough" (P1's premise): it still allows another
  `api.github.com/repos/...` path — an incomplete target-repo scan.
- The `after`/`before` cursor is an ACCEPTED RESIDUAL (documented in code).
  It's an opaque token, so nothing can validate it; a tampered cursor could
  skip a slice. We can't reject it (issues `rel=next` always carries `after`;
  rejecting re-breaks pagination) and the only cursor-dropping remedy —
  self-paginating by `page` — trades churn stability for skips in the
  delete-a-live-asset direction and loops on a future cursor-only endpoint.
  The attack also needs an api.github.com response that could hide a body
  reference regardless. So we follow GitHub's cursor and bind everything
  verifiable around it. (User chose this over self-pagination / before-drop.)
- Aborting unusual pagination only ever over-keeps assets (fail-safe).

## Refute-first review (destructive path)

- Confirmed the original issue with a fake API before editing: an off-repo
  `Link` caused deletion.
- Confirmed against the live API that GitHub uses the `/repositories/{id}`
  path + `after` cursor and that `page` is honored on all scanned endpoints.

## To promote

- Invariant 4 currently says only "the Link rel=next URL re-enters the same
  host allowlist." Cleanup now also binds endpoint + repo id + contiguous page
  on that URL, with the cursor as a documented residual. Worth a follow-up
  note to invariant 4 / the `--cleanup` gotcha.

## Verification

- `npm test` (149 → 154: off-repo, non-advancing, different-repo-id,
  page-skip, unresolvable-id, and a real-Link multi-page keep/delete pair),
  `npm run typecheck`, `npm run build` clean.
- `npm run lint` exit 0 (pre-existing `github.ts` regex info), `format` clean.
