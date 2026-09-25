# Reverse `fetchAssetById`'s null-return contract to throw on failure

The 2026-09-06 note (`2026-09-06-1530-share-asset-refetch.md`) decided
`fetchAssetById` "returns the parsed body (or `null` on throw/non-200/
unparseable body)". That contract is now reversed: `fetchAssetById` throws a
sanitized `Error` for all three failure causes instead of returning `null`.
This note records why, since the old note's decision no longer matches the
code and a future reader must not treat it as still current.

## Problem with the null contract

`idStillHostsUrl` (`src/cleanup.ts`) computed
`got?.browser_download_url === asset.url && got?.name === asset.name`. A
`null` result (re-fetch throw, a 403/5xx, or an unparseable 200 body) produced
`false` here, identically to a genuine 200 response whose fields didn't match.
The delete loop in `cleanup()` could not tell "confirmed this id no longer
hosts the URL" apart from "the re-check itself failed": both printed
`skipped <name> (id no longer matches; re-run --cleanup)`, and `cleanup()`
resolved normally (exit 0) even though nothing had actually been verified for
that asset. A mid-loop `deleteAsset` throw had a parallel problem: it
propagated straight out of the `for` loop, skipping the trailing
`Deleted N asset(s).` line, so a partial run reported no count at all.

## Decision

- **`fetchAssetById` throws instead of returning `null`.** None of network
  throw / non-200 / unparseable-200-body is a legitimate "confirmed, doesn't
  match" answer, so collapsing them into `null` was the root cause. The
  function's return type is now non-nullable.
- **`verifiedDelete` (`src/release.ts`) wraps the call in `try { ... } catch {
  orphanWarn(); return; }`.** Its externally observable behavior — warn, never
  delete, on any re-fetch problem — is unchanged; only the mechanism for
  reaching that branch moved from an `if (!got)`-style check to a caught
  exception. Every existing `verifiedDelete` test passes unchanged.
- **`idStillHostsUrl` (`src/cleanup.ts`) no longer catches.** A thrown re-fetch
  failure now propagates out of it, and `cleanup()`'s delete loop is wrapped in
  `try { ... } finally { say(\`Deleted ${deleted} asset(s).\n\`); }` so the
  count always prints — whether the loop finished, a re-fetch failed, or a
  mid-loop `deleteAsset` threw — before the original error keeps propagating
  to `index.ts`'s existing error chokepoint, which sets a non-zero exit code.
- **Abort on first failure, not count-and-continue.** The spec's stated
  assumption: one `try`/`finally` covers both failure modes with one recovery
  strategy, and it matches cleanup's existing fail-safe posture (stop rather
  than push forward through an unconfirmed state). Continuing to process
  remaining assets after a re-fetch failure would be a separate scope change.
- **Rejected: keep the `null` contract and special-case `null` inside
  `idStillHostsUrl` instead.** That would require every current and future
  caller to re-implement the same throw-vs-mismatch distinction locally.
  Moving the distinction into `fetchAssetById` itself means a caller that
  wants "failure IS a mismatch" (none currently do, and `verifiedDelete`
  doesn't either) must opt in explicitly via its own `catch`, rather than a
  caller that wants "failure must propagate" needing to opt out.

## Verification

Confirmed by reading: `verifiedDelete`'s only change is the `try`/`catch`
wrapper around a call whose success path is byte-identical to before: the
non-200 verify-GET test (`src/release.test.ts:335-353`) and the two genuine-
mismatch `cleanup.test.ts` tests exercise the unchanged branches. New
`cleanup.test.ts` cases cover a non-200 re-fetch, a re-fetch network throw,
and a mid-loop `DELETE` failure, asserting `cleanup()` rejects, the partial
`Deleted N asset(s).` count is still reported, and no failing asset is ever
reported as "skipped ... id no longer matches". `npm test`, `npm run lint`,
`npm run typecheck`, and `npm run build` were run against the full change (see
PR verification for results).

Revisit when: a third caller of `fetchAssetById` needs a re-fetch failure to
mean something other than "propagate" or "treat as orphan" (that would argue
for the throw-vs-mismatch policy living per-caller after all), or when
cleanup's abort-on-first-failure loop needs to become count-and-continue to
finish processing remaining unreferenced assets after one failure.
