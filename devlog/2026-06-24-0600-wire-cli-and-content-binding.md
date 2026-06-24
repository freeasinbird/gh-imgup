# index.ts end-to-end wiring + content-fingerprint binding

Build stage 5 (branch `feat/cli-pipeline`): the first usable tool, on top of the
merged validate/auth/release/github modules.

## Decisions

- **Content-fingerprint binding landed here, not in its own PR.** The deferred
  PR#6 same-length-swap fix (validateImageFile records `ImageFile.sha256`;
  uploadAsset rejects when its digest != that fingerprint) ships in the SAME PR
  as the wiring, because index.ts is what first makes the validate→upload seam
  reachable — shipping the wiring without the binding would open a live exposure
  window. validateImageFile now reads the file (bounded by the just-checked
  size) to hash it; the double read (validate + upload) is accepted over holding
  all files' bytes in memory.
- **index.ts owns the 2nd/last subprocess** (`git remote get-url origin`),
  completing invariant 1's "exactly two" (gh in auth.ts). Array args, 5s
  timeout, output parsed by the host-checking parseGitRemoteUrl.
- **run(argv, deps) returns a CliResult, not raw I/O.** Buffers stderr via a
  `warn` callback so the whole flow is DI-tested against a scripted transport +
  real temp files; the entry point writes the streams. Fail-fast partial
  failure: empty stdout, exit 1, successes on stderr, uploads left for cleanup.
- **--cleanup stubbed** ("not implemented") — it's the next stage.
- **Live round-trip is a human handoff** (DoD): a real upload→comment hits the
  actual repo (creates the `_gh-imgup` prerelease + an asset), an outward-facing
  side effect — flagged Not-run in the PR, not faked. (The `gh` fallback path
  WAS exercised live by a local smoke test.)

## Gotchas (review-caught)

- **P1 — .bin symlink no-op.** npm/npx run the published binary through a
  `.bin/gh-imgup` symlink; `isEntryPoint` compared `process.argv[1]` (the
  symlink) to `import.meta.url` (the real `dist/index.js`), which never matched,
  so the entry block never ran. Fix: `realpathSync` BOTH sides. Tested by running
  the compiled module through a symlink and asserting it produces output.
- **P1 — encoded token in validation errors.** validateImageFile (and the arg
  validators) echo the user-supplied path/flag, and the top-level catch only
  literal-`sanitize`d it, so a missing `ghp%5FTOK.png` leaked the encoded token
  to stderr with no network. Fix: the catch is now decode-aware (redacts the
  whole message if it `decodesToToken`) — the single chokepoint for all
  validate/arg errors, so validate.ts can keep echoing paths for usability.
- **P2 — validation read uncapped.** The new fingerprint `readFileSync` ran after
  the size stat, so a file grown in that window was read uncapped. Fix: re-stat
  right before the read (mirrors uploadAsset), so --max-size still bounds memory.

## Verification

115 tests; a 5-lens adversarial sweep returned zero confirmed findings; the three
review-caught bugs above (two P1, one P2) were fixed with tests.

## To promote to AGENTS.md (accumulating, do in the docs cleanup PR)

- The validate→upload content binding (sha256 fingerprint) as an invariant.
- Pre-existing lint nit to clean: github.ts unescapeMarkdownBackslash regex has
  a Biome `noUselessEscapeInRegex` info (`\/` in a char class) — non-failing,
  slipped through #7.
