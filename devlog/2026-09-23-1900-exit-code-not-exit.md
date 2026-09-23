# Avoid truncating piped stdout by using process.exitCode

`src/index.ts`'s entry-point block wrote `result.stdout`/`result.stderr` then
immediately called `process.exit(result.exitCode)`. Pipe writes are
asynchronous (always on macOS, and on Linux once the pipe buffer backs up),
so `process.exit()` can tear the process down before the write actually
flushes — truncating stdout while still reporting exit 0. On a large
`--json` run (roughly 64 KiB, ~160+ uploaded files) that yields invalid JSON
with a false-success exit code, which violates invariant 7 (exit 0 only when
the complete output was written).

## Fix

Replaced both `process.exit()` calls (success and the catch-all guard) with
`process.exitCode = ...` and let Node exit naturally once pending I/O —
including the writes just issued — drains. `run()`'s own exit-code semantics
(0 for help/version/success, 1 for every handled error) are untouched; only
the shutdown mechanism changed. No helper was extracted around the block: an
earlier draft proposed one purely to make the entry point unit-testable, and
review rejected it (there's nothing left to unit test once the two lines are
`process.exitCode = ...`; the risk is entirely about real process shutdown
timing, which only a real subprocess exercises).

## Regression test

`src/index.subprocess.test.ts` spawns the actual built `dist/index.js` (not
an extracted helper) with piped stdio against 300 mock-uploaded files and
`--json`, then asserts exit 0 and byte-for-byte-correct, >64 KiB stdout.

- **Offline network:** rejected `node:undici`'s `MockAgent` (not a Node
  built-in — confirmed `ERR_UNKNOWN_BUILTIN_MODULE` on Node v22; the
  `undici` package is a separate dependency, out of this task's zero-new-dep
  scope) in favor of a small dependency-free ESM module written to a temp
  file and loaded via Node's `--import` flag, which reassigns
  `globalThis.fetch` before `dist/index.js` loads. It handles exactly the two
  endpoints a plain `--json` upload touches (release-by-tag GET, per-asset
  upload POST) and throws on anything else.
- **Exact-match determinism:** `release.ts`'s `safeFilename` mixes a
  `randomUUID()`-derived hex into each asset name, so the exact upload URLs
  can't be predicted before the run — no lever in the fetch preload reaches
  that RNG. Rather than weakening the assertion to a regex/structural
  approximation, the preload appends each request's real (hex-bearing) asset
  name to a log file as it arrives; the test reads that log after the
  subprocess exits and reconstructs the full expected stdout from it plus
  the fixed, known file contents. This keeps the assertion an exact string
  compare while treating the hex as observed rather than guessed.
- Confirmed the mock's literal `${...}`-bearing lines are ordinary
  biome-clean template literals (built by concatenating a `"$"` across the
  literal-brace boundary) rather than plain strings that look like a
  forgotten template literal.

Revisit when: a lingering-handle regression makes the subprocess hang after
some future change to `run()` (the replan trigger this task called out) — at
that point profile what's keeping the event loop alive rather than
reintroducing a forced `process.exit()`.
