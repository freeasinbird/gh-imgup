# Deduplicate production API I/O dependency defaults

PR #94 (issue #81). `github.ts`, `release.ts`, and `cleanup.ts` each
carried their own `depsOf` helper supplying the same two production
defaults, `fetchImpl ?? fetch` and a stderr warning sink. Three copies
can drift, especially the warn behavior. The refactor extracts a single
`apiIoDefaults(deps)` (`src/deps.ts`) and has each module spread it;
cleanup keeps its own `isTTY`/`confirm` defaults layered on top. No
behavior change intended: same defaults, same warn text/destination/
newline handling, still zero runtime deps.

## Decisions

- **One shared `apiIoDefaults` for the two common API I/O deps only.**
  Module-specific deps (cleanup's `isTTY`/`confirm`) stay declared and
  defaulted at their consumer. Rejected a general service container /
  DI framework as over-abstraction for two fields across three modules.

## Refute-first equivalence verification (destructive path)

`cleanup.ts` is the `--cleanup` destructive path and is on the
mandatory-note list, so per AGENTS.md a behavior-preserving refactor
there requires reconstructing the old implementation and comparing it
against the new decision-for-decision over a fuzzed corpus, not a
diff-read. This closes the P1 review finding on PR #94 (the PR had
recorded only lint/typecheck/unit tests; `deps.test.ts` exercises
`apiIoDefaults` in isolation but never compared old-vs-new cleanup
resolution).

- **Method**: a harness reconstructed `cleanup`'s old `depsOf` verbatim
  from `main:src/cleanup.ts` and built the new resolution from the
  *real compiled* `apiIoDefaults` plus cleanup's unchanged
  `isTTY`/`confirm` lines (a shared sentinel stood in for the opaque,
  unchanged private `defaultConfirm`, isolating the comparison to what
  the diff actually moved: `fetchImpl` + `warn` defaulting).
- **Corpus**: the cross-product of each field ∈ {key absent, value
  `undefined`, a distinct supplied value}, with `isTTY` also covering
  explicit `true`/`false` (a real value `??` must preserve): 108
  combinations. For every defaulted-`warn` case the two `warn` functions
  (different objects) were driven over adversarial probe strings (empty,
  newline, CR, embedded NUL, control chars, multi-byte unicode) and
  their exact stderr bytes compared.
- **Result — CONFIRMED equivalent**: 108/108 combinations agree
  decision-for-decision — `fetchImpl` reference, `confirm`/`isTTY`
  resolution, and byte-identical defaulted-`warn` output. Zero
  mismatches. The refactor changes no destructive-path decision.
- **Dispositions**: the one review finding (missing equivalence pass) is
  *confirmed and now satisfied* by the pass above. No finding was
  rejected-by-verification or accepted-by-decision.

Revisit when: `apiIoDefaults` grows beyond fetch/warn, or cleanup's
`depsOf` starts defaulting anything through the shared helper other than
those two, either of which reopens the equivalence question.
