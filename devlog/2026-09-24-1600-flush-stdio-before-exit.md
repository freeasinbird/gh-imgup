# Flush stdio before exiting the CLI process

`isEntryPoint()`'s `.then()`/`.catch()` handlers called `process.exit(...)`
immediately after `process.stdout.write()`/`process.stderr.write()`. Writes to
a pipe are non-blocking: `write()` returns before the OS pipe drains, and any
remainder past what fit in the current pipe buffer is queued internally,
pending a future 'drain' event. `process.exit()` tears the process down
synchronously, before that event can fire, dropping the queued remainder while
still reporting exit 0 — breaking invariant 7 (stdout machine-parseable only;
exit 0 only on success). A `--json` consumer on the losing end of the race gets
`Unterminated string in JSON` instead of a parse failure it can act on.

## Fix

Replaced both `process.exit(...)` call sites with `process.exitCode = ...` in
place (no helper extraction, per the approved spec) and let Node exit
naturally once the event loop empties — which requires every pending write to
have flushed first. This removes the race structurally rather than papering
over it with a delay.

## Verification

Added a regression test (`src/index.test.ts`) that spawns the real compiled
`dist/index.js` as a child process (not `run()` in-process) via
`execFileSync`, with `globalThis.fetch` mocked offline through a temporary
ESM `--import` preload. It uploads N image files with `--json` and asserts
exit 0, stdout past both a 65536-byte floor and a margin over the measured
buffering threshold below, and that the full JSON array parses with correct
per-entry content (name/URL/digest), not just non-truncated length.

The test was first committed at N=300 (~86KB of stdout). Review (finding
review-1ce37d4776d58d72cc426732) flagged that this doesn't reliably exercise
the race: reverting the fix still passed the 300-file harness in this
sandbox, because this environment's effective pipe buffering before
backpressure kicks in turned out to be ~146KB, not the commonly-assumed
64KiB — so a >65536-byte assertion alone can pass without ever having
triggered the truncation it's meant to catch. Remediation raised the harness
to N=2000 (~500KB+ of stdout) and added a second assertion requiring output
past 200,000 bytes, a margin over that measured threshold. Reverting the fix
against the N=2000 harness reliably reproduces the exact symptom described in
the issue — truncated at exactly 146176 bytes, `SyntaxError: Unterminated
string in JSON` — confirming the race is real and that the fix eliminates it
deterministically, since natural exit no longer races the write queue at all
regardless of payload size.

Review also flagged (finding review-130a044fa687145b9be79398) that passing
2,000 fully qualified temporary paths in one `execFileSync` invocation
deterministically exceeds Windows' 32,767-character process command-line
limit, failing `npm test` on that platform before the child CLI even starts.
Remediation kept N=2000 (preserving the measured margin above) but shortened
argv by spawning with `cwd: flushDir` and passing only each file's basename.

`npm test` (215 tests, up from 214) and `npm run build`/`typecheck` all pass.
`npm run lint`/`format` pass when scoped to `src`, `devlog`, and `README.md`
(`npx biome check src devlog README.md`); a repo-root `biome check .` in this
sandbox hits an unrelated permission error reading `.freeside-evidence/.control`,
a daemon-owned evidence directory outside the repository, not a lint finding
in tracked code. No new subprocess calls or network destinations in
production code; the test's own child-process spawn is test-only and doesn't
count against that invariant.

## Limitations

The test proves the offline path (module load → parse → mocked upload flow →
stdout write → process exit) delivers full output through a real OS pipe. It
does not exercise cleanup of a real undici connection pool after a genuine
network response — no real network call is made. Confirmed by code
inspection, not by a hanging-process test, that nothing else keeps the event
loop alive after `run()` resolves (no open `readline` interface, no timers).

Revisit when: a CI runner or platform shows a pipe-buffering threshold at or
above the ~500KB the N=2000 harness now produces, such that it no longer
reliably reproduces the pre-fix race in practice — the fix itself doesn't
depend on payload size, so this would only affect the regression test's power
to catch a future reintroduction, not correctness of the shipped fix.
