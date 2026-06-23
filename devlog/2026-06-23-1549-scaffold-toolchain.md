# Scaffold TypeScript toolchain + CI

First implementation work unit: stand up the buildable/tested skeleton so
later PRs land green from commit one.

## Decisions

- **Tests run against compiled JS, not type-stripped source.** Spec targets
  Node 22+, but the dev machine has Node 20 (no `--experimental-strip-types`).
  `npm test` = `tsc` build → `node --test dist/*.test.js`. This verifies on
  both Node 20 (local) and 22 (CI) with no experimental flags. Rejected:
  testing `.ts` directly via strip-types (Node-22-only, unverifiable locally
  now); a separate test runner like Vitest (violates zero-dep ethos).
- **`tsconfig` needs explicit `types: ["node"]` + `lib: ["ES2022"]`.** With
  the installed tsc (6.0.3) / `@types/node` (26), NodeNext did not auto-include
  node types — `process`, `node:fs` etc. errored until set explicitly.
- **Biome over Prettier+ESLint** (decided in setup): one devDep, one tool for
  lint + format. Style set to **Prettier-aligned** — 2-space, double-quote,
  80-col — the de facto community default; Biome's own default (tabs) is less
  common in the TS ecosystem. Otherwise Biome's recommended lint preset.
- **Scaffold `run()` is pure** (`argv -> {stdout, stderr, exitCode}`), with a
  thin `isEntryPoint()` guard doing the actual I/O. Lets the smoke test assert
  the output contract (stdout machine-only) without spawning a process.
- **CI pinned to Node 22** (the project floor); local Node 20 is below it.

## Deferred

- Real upload/auth/validate/release/cleanup modules — this PR is skeleton only;
  `run()` handles `--help`/`--version` and exits 1 ("not yet implemented")
  otherwise.
- README, SECURITY.md, CHANGELOG.md, docs/, the `gh` extension wrapper, and
  `skills/gh-imgup/SKILL.md` — separate work units.

## Open questions

- Dev machine is on Node 20; consider bumping local to 22 to match the
  declared runtime (not blocking — build/test path is version-agnostic).
