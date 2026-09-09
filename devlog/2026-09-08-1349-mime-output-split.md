# Split src/upload.ts into MIME policy and output rendering modules

`src/upload.ts` held two unrelated concerns: the MIME allowlist
(`MIME`/`mimeFor`) and stdout rendering (`UploadResult`, `OutputFormat`,
`render` and its private helpers). `validate.ts` consumes only the MIME half.
`index.ts` consumes the rendering half in full: the `UploadResult`/
`OutputFormat` types and `render` itself. `release.ts` consumes only the
`UploadResult` type, as the return type of `uploadAsset`; it never calls
`render` or references `OutputFormat`. The combined file forced `release.ts`
to depend on a module whose only behavior (rendering) it never used.

## Decision

- **Two modules, split exactly on that consumption boundary.** `src/mime.ts`
  gets `MIME`/`mimeFor` (validate.ts's dependency); `src/output.ts` gets
  `UploadResult`/`OutputFormat`/`render` plus its private `altText`/
  `markdownDestination`/`markdownLine` helpers. `index.ts` depends on all
  three; `release.ts` depends only on the `UploadResult` type. Both are pure
  code motion — no behavior, doc comment, or test assertion changed.
- **`UploadResult`/`OutputFormat`/`render` stay together as one "rendering"
  concern rather than splitting further — a design tradeoff, not something
  forced by every consumer needing all three.** `release.ts` needs only the
  `UploadResult` type, not `render` or `OutputFormat`; splitting the type into
  its own types-only module would serve that consumer marginally more
  precisely. That was rejected because `UploadResult` has no meaning apart
  from the function that defines what a valid instance looks like: nothing
  else constrains its fields. Co-locating the type with `render` keeps the
  rendering contract (AGENTS.md invariant 7/10) owned end to end by one file,
  at the cost of `release.ts` importing a module that, for it, provides only
  a type.
- **No dependency between `mime.ts` and `output.ts`.** Neither concern uses
  the other: MIME resolution runs at file-validation time, output rendering
  runs at result-formatting time, and nothing in `render`'s output (URL,
  filename, digest) is derived from a MIME type. Keeping them independent
  (each depending only on `node:path`/`./markdown.js`, never on each other)
  is what makes the split meaningful rather than cosmetic.

## Cycle check

`mime.ts` imports only `node:path`. `output.ts` imports only
`node:path` and `./markdown.js`. Neither imports the other, nor
`validate.ts`/`release.ts`/`index.ts`. `validate.ts` now imports `mime.ts`
in place of the old combined `upload.ts`; `release.ts` imports `output.ts`
for the `UploadResult` type only, and `index.ts` imports it for the type,
`OutputFormat`, and `render`. No new edge was introduced back from either new
module into a caller, so no cycle exists among
`mime.ts`/`output.ts`/`validate.ts`/`release.ts`/`index.ts`.

This is a pure code-motion refactor: no destructive path, credential surface,
or trust-boundary change, so the heavier refute-first adversarial-verification
protocol doesn't apply.
