# Versioning policy: 0.x soft-launch, 1.0.0 freezes the contract

Branch `docs/versioning-0x-policy`. Owner decided the first-published-version
question (#16): ship **0.1.0** now, move to **1.0.0** once real-world usage
makes us comfortable freezing the contract.

## Why

The output contract (invariant 7) and CLI surface are stable by intent, which
argued for 1.0. But the tool has had no real users yet (only a synthetic live
e2e test), so a `0.x` soft launch preserves room to adjust the surface on real
feedback before committing to the semver promise. The earlier "don't overclaim
maturity" reasoning (README dropped a fictional `@1.0.0`) still applies until
field use accrues.

## Changes

- `package.json` already at `0.1.0` — no code change needed.
- README: added a **Versioning** note to the status block — ships `0.x` while
  usage accrues; `--json`/`--raw`/exit codes are stable by intent but not a
  frozen promise until `1.0.0`.
- AGENTS.md: convention bullet — `0.x` until a deliberate `1.0.0` freeze; don't
  bump to 1.0 or break the contract assuming a minor may, without that human
  call.
- #16: "Decide the first published version" box checked with the decision.

## Verification

- Docs only; `npm run lint` / `format` clean, no `src/` touched.
