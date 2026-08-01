# Make --version fail clearly on a broken package.json

Issue #83: `version()` read `package.json` and cast its `version` field
without validation. A missing/unreadable file threw Node's raw
`ENOENT` error to stderr; malformed JSON threw `JSON.parse`'s own
message (which can include a snippet of the offending text); a
missing/non-string/empty `version` field wasn't caught at all — the
CLI printed `undefined` (or similar) to stdout with exit 0, breaking
the output contract (invariant 7: stdout on success, one sane value).

## Decisions

- **One injectable `readManifest(): string` seam**, threaded through
  `RunDeps`/`VersionDeps`, replaces the hard-coded `readFileSync` call.
  Chosen over module-level `fs` mocking (the repo's stated DI
  convention — see AGENTS.md's "I/O is tested via dependency
  injection" — and ESM named imports are read-only bindings anyway) and
  over adding a general filesystem-mocking helper (the acceptance
  criteria call for the narrowest seam; one function that returns raw
  text lets tests hit read failure, malformed JSON, and every
  version-shape failure without touching the real filesystem).
- **Every failure collapses to one generic, actionable message**
  (`Could not read package.json...`, `package.json is not valid
  JSON...`, `package.json has no valid "version" field...`, each
  suffixed "Reinstall gh-imgup."), not the underlying error's own
  message. Rejected: forwarding `err.message` (or a JSON.parse
  snippet) as more diagnostic — Node's `ENOENT` message embeds the
  resolved absolute path and `JSON.parse` can embed the offending
  input, both explicitly excluded by the acceptance criteria's "no raw
  manifest contents ... in errors." A broken `package.json` only
  happens on a corrupted/tampered install, where "reinstall" is the
  only actionable remedy anyway, so nothing diagnostic is lost.
- **Validation shape**: absent, non-string, blank, or control-containing
  `version` values all hit the same branch and message. The control check
  reuses `collapseControls`, which already defines the project's complete
  log-line-breaking set (C0, DEL, C1, and Unicode line/paragraph separators),
  and rejects when normalization would change the value. Rejected: checking
  only `\n`/`\r`, which would leave other line-breaking controls able to put
  manifest-controlled content on stdout, and full semver parsing, which is
  wider than this output-safety boundary. Splitting invalid shapes into
  separate messages was also rejected: none is more actionable than
  "reinstall."

## Refute-first verification

An independent executable corpus exercised the compiled `run(["--version"])`
boundary directly, without reusing the validation condition:

- **Confirmed**: the first Codex review found that the original empty-string
  check accepted line-breaking controls, allowing manifest-controlled extra
  stdout lines. The second review correctly found that this high-assurance
  disposition ledger was missing. Both findings were accepted and fixed.
- **Rejected by verification**: no control bypass remained across all 67 C0,
  DEL, C1, and Unicode line/paragraph-separator code points at the start,
  middle, and end of a version (201 placements). Six blank-value variants all
  returned exit 1 with empty stdout and one stderr line. Separate read, parse,
  and shape failures carrying unique marker text did not disclose it. Three
  printable values retained exact one-line stdout and exit 0.
- **Accepted by decision**: printable, nonblank, control-free strings that are
  not valid semver remain accepted. Full semver validation is outside issue
  #83's output-safety boundary, would add a separate compatibility policy,
  and is not needed to prevent line or log forging. Revisit that choice only
  if the CLI begins consuming the version semantically rather than printing
  package metadata.

## Revisit when

Another manifest-derived value needs the same read/parse validation —
at that point the try/catch pair here is worth factoring into a
shared `readManifestField` helper rather than duplicating it.
