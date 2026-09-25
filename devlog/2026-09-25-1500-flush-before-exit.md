# Set process.exitCode instead of calling process.exit() at the entry point

`process.stdout`/`process.stderr` writes to a piped destination are
asynchronous. The two `process.exit(...)` calls at the bottom of
`src/index.ts` (in the `isEntryPoint()` block's `.then()` and `.catch()`) tore
the process down immediately after queuing `result.stdout`/`result.stderr`,
before Node had finished flushing them to the pipe. A consumer piping
`--json` output for 100+ files into a JSON parser could receive a document
truncated at the pipe's 64 KiB kernel buffer alongside a misleading exit 0,
violating invariant 7 (stdout is machine-parseable only, exit 0 only on full
success).

## Decision

Replace both `process.exit(...)` calls with `process.exitCode = ...`.
Assigning `exitCode` lets Node drain the event loop, including the queued
writes, before exiting on its own with the assigned code; `run()`'s own
`CliResult.exitCode` contract is unchanged for every path (success, partial
failure, error, `--cleanup`) — only how the entry point turns that result
into a process exit changes.

## Risk considered: the process must still exit promptly

Removing `process.exit()` only fixes the truncation if the event loop
actually drains once `run()` resolves; an un-`unref()`'d open handle (most
plausibly a kept-alive `fetch`/undici socket after a real call to
`uploads.github.com`/`api.github.com`) could turn a silent truncation bug
into a silent hang instead. A mocked-fetch test can't rule this out, since a
mock opens no real socket. This is the reason the regression test spawns the
real compiled entry point rather than testing `run()` in-process, and why the
project's real-repo verification step (upload → PR/issue comment round-trip)
includes timing the process to confirm it exits on its own within a few
seconds, for both a successful run and an error-exit run.

## Regression test

`src/index.test.ts` gained a test that spawns the compiled `dist/index.js`
(via the existing symlink/`execFileSync` pattern) with piped stdio and 300
fixture files, large enough to push `--json` output past 64 KiB. Network is
mocked via a `node --import` preload (`src/fetch-preload.test.ts`) that
patches `globalThis.fetch` before the CLI module executes, so `isEntryPoint()`
and the real `process.exitCode` path run unmodified with no real network
call. The preload file is named `*.test.ts` to stay covered by the existing
`!dist/**/*.test.js` packaging exclusion; it has no `test()` calls itself and
is a no-op unless `GH_IMGUP_MOCK_FETCH=1`, so it doesn't affect `npm test`'s
bare `node --test dist/*.test.js` run outside that spawned child.

## Verification

`npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` all
clean (see the run's own summary for exact counts). `npm pack --dry-run
--json` confirms `src/fetch-preload.test.ts`'s compiled output is excluded
from the published tarball, same as the existing `*.test.ts` sources.

Revisit when: a future entry-point change reintroduces `process.exit()`
directly after a stdout/stderr write, or when the real-repo verification step
surfaces an actual hang (an unreleased handle) rather than the truncation
this change fixes.
