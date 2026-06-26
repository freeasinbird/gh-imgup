# AGENTS.md

`gh-imgup` is a zero-dependency TypeScript CLI that uploads images to
GitHub issues and PRs via the documented Release Assets API — built for
agents and CI that need to attach screenshots (especially before/after
UI images) to PRs for human reviewers. The full specification lives in
[README.md](README.md) and the design history in `docs/`. This file is
the single source of truth for development conventions — branch naming,
pull requests, commits, build commands, and the security invariants that
define the project. It serves both human contributors and automated
agents.

<!-- agents-md:managed:devlog -->

## Devlog (session bookends)

`devlog/` holds the reasoning trail — one short entry per working
session (see `devlog/README.md` for the protocol).

- **Before starting:** read the most recent one or two entries
  (`find devlog -maxdepth 1 -type f -name '*.md' ! -name README.md | sort | tail -2`)
  — they carry decisions and deliberate deferrals that aren't in the spec.
  Don't re-litigate or "fix" what an entry marks as decided/deferred without
  the user asking. Also `grep` the devlog for the open `To promote` /
  deferred / needs-human queue so promotions don't span sessions unnoticed.
- **Before finishing:** append `devlog/YYYY-MM-DD-HHMM-slug.md` — decisions
  (why, and what was rejected), deferrals, open questions. Note anything
  that should be promoted to AGENTS.md — a new invariant discovered, a
  convention that wasn't written down, a gotcha that bit you. The devlog
  entry records it; a follow-up commit promotes it. Use local 24-hour
  time so same-day entries sort in session order. Keep it dense — decisions,
  not narration; target ≤ ~40 lines per session-round, scaling when one entry
  consolidates many review rounds. Commits and PR threads carry the
  what-changed.

<!-- /agents-md:managed:devlog -->

<!-- agents-md:managed:finish-line -->

## Default agent finish line

For any user request that asks you to change code, docs, assets, or project
state, the default endpoint is **an open, review-ready PR with required
checks green** — not a merged branch. Merging is a human decision; do not
merge your own PR unless the user explicitly asks, or the project has adopted
an opt-in self-merge workflow.

Use this checklist at the start of each work session:

1. Read README plus the latest devlog entries, then start from `main` — or,
   for a follow-up that depends on an open PR, from that PR's branch (see
   Stacked PRs under Pull requests).
2. Create one correctly named branch for the work unit.
3. Make the scoped change, including docs/devlog/tests/assets that keep it
   complete.
4. Run the relevant verification plus the standard lint/build/test checks
   before PR; if any check cannot run, record the exact gap in the PR.
5. Commit one concern at a time with a body that says why.
6. Before opening a docs/chore PR (or at session end), `grep` the devlog
   for the open promote / deferred / needs-human queue and clear what the
   current scope covers, or explicitly re-defer — decided invariants
   shouldn't live only as devlog archaeology.
7. Push, open the PR with the template, and remove sections that do not apply.
8. Poll required checks until they finish; fix failures on the branch.
9. Self-review the PR files view, then hand off — leave the PR open for a
   human to review and merge.

For changes on a **destructive path** (delete/cleanup), a
**credential-leak surface**, or a **returned-object-trust boundary**, add a
refute-first verification pass before committing — independent lenses whose
job is to _disprove_ the fix — and record in the devlog which findings were
confirmed, rejected-by-verification (so they're not re-raised), and
accepted-by-decision. Scope this to those risk classes; a docs typo or
pure refactor shouldn't trigger it.

Stop once the PR is open, green, and self-reviewed. Say what remains (review
and merge) and point the reviewer at anything that needs attention. Don't
merge, delete the branch, or resync `main` yourself unless the user asks for
that, or the project has adopted a self-merge workflow.

<!-- /agents-md:managed:finish-line -->

## Build, test, run

- **Runtime:** Node.js 22+ (global `fetch`, `node:test`). CI runs Node 22;
  the build/test path targets compiled output, so it also runs on Node 20
  for local development.
- **Package manager:** npm. Published as an npm package; also distributed
  as a `gh` CLI extension and an agent skill (all three point at the same
  compiled `dist/`).
- **Zero runtime dependencies.** `package.json` carries only
  `typescript` and `@types/node` as devDependencies (Biome is added as a
  devDependency for lint/format — see below). The published artifact uses
  Node built-ins and global `fetch` only.

Intended npm scripts (single command each, runnable in CI):

| Task        | Command            | Notes                                              |
| ----------- | ------------------ | -------------------------------------------------- |
| Build       | `npm run build`    | `tsc` — compiles `src/*.ts` → `dist/`              |
| Type-check  | `npm run typecheck`| `tsc --noEmit`                                     |
| Test        | `npm test`         | builds, then `node --test dist/*.test.js` (built-in runner + `node:assert`); tests run against compiled output, not type-stripped source |
| Lint        | `npm run lint`     | `biome check .`                                    |
| Format      | `npm run format`   | `biome format --write .`                           |
| Run (local) | `node dist/index.js <file...> [options]` | or `npx @freeasinbird/gh-imgup …` once published |

- **CLAUDE.md is a pointer** that imports this file (`@AGENTS.md`). Edit
  AGENTS.md, never the pointer.
- **CI** (`.github/workflows/ci.yml`) runs `npm run lint`, `npm run typecheck`,
  and `npm test` (which builds) on every PR and push to `main`. The workflow
  conventions below assume these checks exist and gate merges — keep them
  green and don't remove the gate.

## Architecture invariants

These rules protect the project's security model — its entire reason for
existing over the alternatives. Each states what it prevents and how it's
enforced. Violating one is a security regression, not a style nit.

1. **GitHub API access is `fetch()`-only — no shell for GitHub ops.**
   Prevents shell injection structurally rather than defending with
   escaping. The compiled CLI makes exactly **two** subprocess calls ever —
   `execFileSync('gh', ['auth', 'token'])` and
   `execFileSync('git', ['remote', 'get-url', 'origin'])` — both with array
   args (no shell), no user input in the array, guarded by try/catch and a
   5s timeout. Adding a third subprocess call, or string-interpolating into
   either, breaks the invariant. (The `gh`-extension wrapper is a separate
   thin bootstrap shell script that builds/locates `dist/` and forwards args
   to `node`; it interpolates no user input. Scope security claims to the
   compiled CLI vs. the wrapper accordingly — docs that conflate them are
   wrong.)

2. **Zero runtime dependencies.** Keeps the supply-chain audit surface to
   the tool itself plus Node built-ins. Enforced by `package.json` declaring
   no runtime `dependencies`; reviewers reject any runtime dep.

3. **No credential leaks in output.** Every error/echo path strips
   credentials before they reach stderr, CI logs, or agent context — both
   the resolved API token AND any credentials embedded in a git-remote URL
   (userinfo). Error-path redaction is decode-aware: a value is redacted if
   it decodes to the token literally or through `%XX` / JS-JSON `\uXXXX`
   escapes, and control characters (C0/DEL/C1, line/paragraph separators)
   are collapsed so a tampered response can't forge log lines. These defenses
   live in `apierr.ts` (`sanitize` / `decodesToToken` / `redactField` /
   `redactBody`); any new path that prints an API response or a
   response-derived value must route through them. Separately, the PUBLIC
   comment surface refuses to post a body whose token appears in a *rendered*
   form — HTML entities (named/numeric/zero-padded) or backslash escapes —
   via `github.ts` `renderInlineMarkdown` (the normalization cleanup matching
   also uses). That is a refusal, not error redaction: `apierr.ts` does not
   decode HTML entities, so don't claim the error path does.

4. **No third-party destinations; HTTPS-only; no client redirects.**
   Requests go to exactly `api.github.com` and `uploads.github.com`, over
   HTTPS (the token never traverses plaintext, even to an allowed host),
   with `redirect: 'error'` (a redirect elsewhere fails rather than being
   silently followed). On the `--cleanup` destructive path the `Link` rel=next
   pagination URL is not just re-checked against the host allowlist but bound to
   the surface being scanned — same endpoint, same repo (accepting GitHub's
   numeric `/repositories/{id}` rewrite, re-bound to this repo's id), original
   query preserved, page advancing by exactly one — with the opaque `after`
   cursor as a documented residual; a `Link` header that is present but can't be
   safely parsed fails closed (aborts before any delete) rather than reading as
   "no next page". There is no fallback host; missing/invalid credentials
   fail loudly. Never add an alternative destination.

5. **Strict MIME allowlist, no inference.** Only `.png/.jpg/.jpeg/.gif/.webp`
   map to fixed MIME types. No content sniffing, no `application/octet-stream`
   fallback. SVG is excluded (active-content format); if ever added it goes
   behind an explicit `--allow-svg` flag with a warning.

6. **Upload integrity is verified end-to-end.** The file's SHA-256 is
   recorded at validation and the upload refuses if the bytes changed
   between validation and read (defeats a same-length content swap); after
   upload, the local SHA-256 is compared against the API `digest` and, on
   mismatch, the asset is deleted and the run fails. If the server omits a
   digest, warn on stderr (don't silently pass).

7. **Output contract: stdout is machine-parseable only.** Markdown, raw
   URL(s), or JSON to stdout — `--json` is **always a JSON array** (one
   object per file, even for a single file) so consumers parse one stable
   shape; all progress, warnings, and errors to stderr. Exit 0 only when
   every upload succeeded. Don't print human chatter to stdout.

8. **On a destructive path, match the fully-decoded form and fail toward
   keeping.** When deciding whether an asset may be DELETED by matching it
   against rendered/encoded text (its URL/name vs. an issue/PR body),
   normalize both sides through the full decode stack GitHub can apply —
   raw, Markdown-rendered (named + numeric HTML entities, backslash
   escapes), and percent-encoding (case-insensitive, multi-byte UTF-8) — and
   treat any ambiguity as *referenced* (keep). Over-decoding only over-keeps
   (safe); a missed reference deletes a live image (not). Non-ASCII-named
   assets are kept rather than matched (the full named-entity table isn't
   decoded). This biasing applies to the destructive/match direction only.

9. **Trust no response-derived URL without re-binding it to the target.**
   Before echoing or acting on a URL from an API response, validate it
   against the target — host + owner/repo + path shape + id (e.g.
   `isUsableAssetUrl`, `usableCommentUrl`), not just the host. A malformed,
   off-repo, or tampered URL is rejected (dropped, or the run aborts on a
   destructive path), never reported or deleted-by.

## Conventions & gotchas

- **Versioning: `0.x` until the contract is deliberately frozen at `1.0.0`.**
  The first publish is `0.x` (a soft launch while real-world usage accrues). The
  CLI surface and the machine-output contract (invariant 7) are stable by intent
  — avoid gratuitous breaks — but `0.x` signals the formal semver promise isn't
  made yet. `1.0.0` freezes that contract and is a deliberate human call once
  usage justifies it; don't bump to `1.0` (or break the contract assuming a minor
  may) without that decision. See issue #16.
- **Prerelease, never draft.** The `_gh-imgup` release must be a
  prerelease — draft releases can't be resolved by tag, so asset
  `browser_download_url`s 404. This is load-bearing, not a preference.
- **Release tags must start with `_`.** `validateTag` rejects anything
  else, preventing `--tag v2.0.0` from polluting real releases. Default is
  `_gh-imgup`.
- **Create-or-get is race-safe.** Two concurrent runs both see 404 and try
  to create; one gets 422. On 422 (tag exists), retry the GET; on 422 for
  any other reason, fail with the original error.
- **`--cleanup` is fail-safe and interactive — no `--yes`.** It scans five
  repo-wide surfaces (issue/PR bodies, their comments, inline PR review
  comments, commit comments, release notes) — not wikis, repo files,
  Discussions, or off-GitHub — so it can't prove completeness. Any scan or
  listing error aborts *before* any delete; matching only ever false-*keeps*
  (never false-deletes); each asset is re-fetched by id to confirm it still
  hosts the matched URL+name before deletion; it refuses to run without a TTY
  (no piped `y`); and it keeps non-ASCII-named assets (invariant 8). Per-asset
  manual removal is `gh release delete-asset <tag> <name>`; whole-release
  deletion (`gh release delete`) is intentionally never automated — it breaks
  every embedded image.
- **Three distribution channels, one codebase.** npm package, `gh`
  extension wrapper (root `gh-imgup` shell script), and `skills/gh-imgup/SKILL.md`
  all point at the same compiled `dist/`. Keep them in sync.
- **Never attach a release asset whose name ends in a platform `<os>-<arch>`
  suffix** (`*-darwin-amd64`, `*-linux-amd64`, `*-windows-amd64.exe`, …) — and
  that's _any_ asset, not just a `gh-imgup-<os>-<arch>` binary. The `gh`
  extension is **source-install only** (gh clones the repo and runs the root
  `gh-imgup` script). `gh extension install` flips to binary-download mode the
  moment the latest release carries _any_ asset whose name ends in a known
  `<os>-<arch>` suffix — that's the `isBinExtension` check in `cli/cli`
  (`pkg/cmd/extension/manager.go`): it `strings.HasSuffix`-matches every asset
  name against `possibleDists()` with **no `gh-imgup-` prefix requirement**, and
  doesn't care whether a release exists. So a stray helper artifact (a checksum
  file, an SBOM, …) named `…-linux-amd64` would trip it just as a real binary
  would. A normal versioned `vX.Y.Z` release with notes is fine and does NOT
  break the extension (GitHub's auto source tarballs aren't in the `assets`
  array); just keep every attached asset's name clear of those suffixes. We ship
  no precompiled binaries (a per-platform bundled Node runtime would undercut the
  zero-runtime-dep model) — see issue #14. Going binary later is a deliberate,
  separately-reviewed switch.
- **`dist/` is gitignored, so packaging builds it at pack time.** The `prepack`
  script (`npm run build`) is load-bearing: the npm `bin` points at
  `dist/index.js`, and without the hook `npm pack`/`npm publish` from a clean
  checkout would ship a tarball with no `dist/` (only LICENSE/README/manifest) —
  a broken install. Don't remove `prepack`. The `files` array also excludes
  `dist/**/*.test.js` (the compiled tests live in `dist/` for `npm test` but
  must not ship); verify with `npm pack --dry-run --json`.
- **The SKILL.md pre-upload image review is a security control**, not
  documentation filler — it's the highest-impact mitigation in the system
  (the upload is secure; the risk is what gets uploaded). Don't weaken it.
- **Case-fold what GitHub case-folds, exact-match what it doesn't.** owner,
  repo, and hosts compare case-insensitively (GitHub canonicalizes them);
  tags compare exactly. An over-strict `===` casing check on owner/repo would
  false-reject and orphan a real upload.
- **The per-upload hex suffix is the binding key.** `safeFilename` appends
  random hex to the stem (`{stem}-{hex}.{ext}`); that suffix is how a returned
  asset URL is proven to be ours. Exact-name matching was rejected because
  GitHub's own filename sanitization can differ from the requested name.
- **Verify risky changes adversarially.** Before committing a change on a
  destructive path (`--cleanup`), a credential-leak surface, or a spot that
  trusts a response-derived value, run an independent refute-first review and
  record in the devlog which findings were confirmed, rejected-by-verification,
  or accepted-by-decision. Scope this to those risk classes — not every change.
- **Docs are audited against the code.** README/SECURITY/CHANGELOG claims
  (counts, flags, behaviors, the subprocess/network guarantees) are checked
  against `src/`, scoped to the surface they describe (the compiled CLI and
  the `gh`-extension wrapper differ), and stated plainly — no marketing, no
  unverifiable claims about other tools. Same "facts only" discipline as
  Verification, applied to shipped docs.
- **Authoring control-char / escape regexes through the edit tooling is
  unreliable.** A character class with control chars, `\uXXXX` escapes, or a
  `\x00-\x7f` range can have its escapes decoded into literal bytes (or the
  range mangled) by the editor/JSON layer. Write such regexes via a node
  script (or use `codePointAt` scans instead of escape ranges) and byte-audit.
- **I/O is tested via dependency injection.** Modules take their side effects
  (env, the gh/git subprocess, `fetch`, `warn`, `isTTY`, `confirm`) as
  injectable params with production defaults; tests script a fake transport
  *through* the real `authedFetch` and use real temp files for SHA-256. Chosen
  over module-mocking because ESM named imports are read-only bindings.
- **Drain devlog "to promote" notes before a docs/chore PR.** `grep` the
  devlog for the open `promote` / `deferred` / `needs human` queue and either
  promote what the PR's scope covers or explicitly re-defer — invariant notes
  must not pile up unpromoted (they did, across nine entries, before this
  cleanup). File maintainer-only actions as issues (`Refs #N`), not as devlog
  headings that the start-of-session read won't resurface.

<!-- agents-md:managed:branches -->

## Branches

All work lands through a PR: branch from `main`, do the work as atomic
commits (see Commits), open a PR, merge with a real merge commit —
never commit directly to `main`. No triviality exception; exceptions
are where the `--first-parent` narrative erodes.

Name branches `<type>/<short-kebab-slug>` — type from the Conventional
Commits vocabulary (`feat`, `fix`, `refactor`, `docs`, `chore`), slug
2–4 kebab-case words naming the work unit:

```text
feat/worksheet-promotion
fix/pane-focus-race
chore/swift-format-sweep
```

Exactly one slash — refs are path-like, so `feat/x` and a branch named
just `feat` can't coexist. No ticket numbers, dates, or owner prefixes;
prepend an owner segment (`bnw/feat/…`) only if multiple people or
agents start pushing in parallel. Merged branches auto-delete (repo
setting) — the merge commit carries the narrative.

Follow-up work that depends on an open PR can stack on its branch instead
of waiting — see the Stacked PRs pattern under Pull requests.

<!-- /agents-md:managed:branches -->

<!-- agents-md:managed:pull-requests -->

## Pull requests

A PR is one work unit, reviewed as a whole and merged with a real merge
commit. Commits carry the atomic why (see Commits); the PR carries the
arc.

- **Title** — imperative, ≤ 72 chars, names the outcome, no type prefix
  or ticket noise ("Fix missing menu bar on unbundled launch"). Repo
  settings put the PR title and body into the merge commit, so
  `git log --first-parent` reads as the list of PR titles — write the
  title for that log.
- **Body** — scaffolded by `.github/pull_request_template.md`:
  - **Why** — prose, one to three short sentences. State the problem or
    motivation. Link the devlog entry when one exists; don't duplicate it.
    Add a close keyword immediately before each issue number the PR fully
    resolves or finishes (`Closes #11`; repeat the keyword to close several
    — `Closes #11, closes #12` — since a bare list like `Closes #11, #12`
    closes only the first). Reference related-but-unfinished issues with a
    plain `#N` (e.g. `Refs #N`), which links without closing, and leave
    those for a human.
  - **What** — required bullets. Describe work-unit outcomes, not
    file-by-file churn. For multi-commit PRs, use a compact commit map
    (one bullet per commit or concern) and say rejected alternatives live
    in the devlog when they do.
  - **Screenshots** — required for PRs with visible UI changes; delete it
    for non-visual work. Replace the section with actual GitHub-hosted,
    reviewer-visible image or recording attachments before merging; local
    paths, textual descriptions, and "checked locally" notes do not satisfy
    it. If you cannot attach the artifacts yourself, stop before merge and
    ask the user to add or confirm them. Show the changed surfaces,
    important states, and both paper/ink palettes when the change affects
    appearance. Keep captions short and name the state shown. Verification
    still belongs in Verification.
  - **Review Notes** — optional bullets; delete the section when it adds
    no routing value. Use it to point reviewers at important files, review
    order, mechanical commits, or risky edges.
  - **Verification** — required bullets. Start each with `Passed:`,
    `Checked:`, `Attempted:`, or `Not run:`. Say what was actually run and
    observed: tests, lint, fixture/screenshot checks (both palettes for
    UI), export/import round-trip for schema changes. Facts only — never
    "should work"; verification gaps are explicit `Not run:` bullets.
    Factual doc claims ship under the same discipline: counts, flags,
    behaviors, and subprocess/network guarantees are checked against the
    code and scoped to the surface they describe (a compiled CLI and a
    wrapper script differ), stated without marketing or competitor
    put-downs.
- **Self-review the diff in the PR files view before handing off** — it
  catches stray hunks and leftovers the editor view didn't.
- **Responding to automated review.** Bot reviewers (inline P1/P2
  comments) draw a lot of feedback; evaluate each comment on its merits.
  Fix real findings; push back — _with a one-line reason_ — on contrived,
  speculative, or already-fixed ones. Do not reflexively comply. Reply
  inline with the disposition and the fixing commit SHA ("Fixed in
  `<sha>`" / a reasoned decline), then resolve the thread. Resolving every
  thread is _not_ a hard merge gate — evaluate-on-merits is.
- **Keep the body current as review evolves the PR.** The body becomes the
  merge commit, so when review adds commits or shifts scope, update What, the
  commit map (flag which commits resolve review findings), and Verification
  before re-handing-off. The inline disposition + fixing SHA on each resolved
  thread (above) is the located per-finding record — don't duplicate it into
  a standing "feedback" section that would drift.
- Merge-commit merges are the only enabled method (squash and rebase
  are disabled in repo settings) and merged branches auto-delete — the
  settings enforce the Commits rules; don't re-enable around them.

### Handing off the PR

Opening the PR is the agent's finish line — leave it open for a human to
review, approve, and merge, unless the user explicitly asks you to merge or
the project has adopted a self-merge workflow. Once the PR is up:

- **Wait for required checks** — poll `gh pr checks <n>` until they
  complete; fix any red check on the branch, never hand off a known-red PR.
- **Self-review the diff** (above) so it's ready for a reviewer.
- **Watch for new review activity between turns** — the finish line means
  open, green, threads handled, self-reviewed, _and no new review activity
  outstanding_. Poll open PRs for _both_ new review comments and CI,
  address findings on the branch, and only then declare done. This is
  guidance, not mandated automation.
- **Stop and summarize** — say the PR is open and green, and surface
  anything the reviewer should focus on. Leave merging, branch cleanup, and
  the `main` resync to whoever approves it.

If the user does ask you to merge, use `gh pr merge <n> --merge` (the only
enabled method; the remote branch auto-deletes), then resync
(`git checkout main && git pull --ff-only`), delete the local branch
(`git branch -d <branch>`), and `git fetch --prune`.

### Reviewing a PR

The mirror of "Responding to automated review" — hold the bar you'd want
held for you. Use the project's review tooling for the bug-hunting pass;
these are the conventions for the comments it produces.

- **Calibrate to severity, and tag it.** Separate blocking findings
  (correctness, security, data-loss, red tests/CI, broken invariants) from
  non-blocking ones (naming, style, optional simplification). Only blockers
  gate the merge. Don't manufacture speculative or contrived findings — the
  author convention is to decline those with a one-line reason.
- **Every comment carries evidence and a concrete ask.** Point at
  `file:line`, name the failure it causes, and propose a fix or ask a
  question. Mark uncertainty as uncertainty ("possible:"), never assert it —
  the Verification facts-only discipline applies to review too.
- **Review against intent, not just the diff.** Read the PR's Why/What and
  the devlog; check the change does what it claims, that Verification matches
  reality, and that docs/tests moved with behavior. Don't relitigate what the
  devlog marks decided or deferred.
- **Stay in scope.** Out-of-scope improvements are non-blocking nits or a
  follow-up issue, not merge-blockers; don't grow the PR through review.
- **Scale depth to risk.** Routine PRs get a normal pass; destructive /
  credential-leak / trust-boundary changes get the refute-first lens (see the
  finish line). A docs typo doesn't.
- **Resolve explicitly.** State what would unblock; let the author
  fix-or-decline. Resolving every thread isn't the gate — agreement on
  blockers is.

### Stacked PRs

Dependent docs or cleanup work can proceed without waiting for its base: a
follow-up PR can be based on an open PR's branch (`gh pr create --base
<feature-branch>`) and auto-retargets to `main` when the base merges. Two
gotchas: while the base is open the stacked PR's diff shows only its own
commits; and if the base is force-pushed (fold-fix above), `rebase --onto`
the stack onto the new base tip.

<!-- /agents-md:managed:pull-requests -->

<!-- agents-md:managed:commits -->

## Commits

History is optimized for three uses: diagnostics (blame/bisect lead to a
cause), reviewability (a PR reads commit-by-commit), and learning (the
log tells the project's evolution). Rules:

- **One concern per commit, every commit green.** If the body wants
  labeled sections (Correctness:/Performance:/…), it's more than one
  commit — split it. Each commit must build and pass tests on its own;
  never leave red intermediate states (it breaks bisect).
- **Body says why, not just what.** Keep the current style: dense,
  specific, wrapped ≤ 72 columns. Reference the session's devlog entry
  when one exists. State change deltas ("27 → 36 tests") if meaningful;
  never absolute status ("36 tests green") — CI asserts that, and it
  goes stale.
- **Mechanical churn commits alone.** Reformats, renames, and moves get
  their own commit, added to `.git-blame-ignore-revs` in the same change
  (activate locally with
  `git config blame.ignoreRevsFile .git-blame-ignore-revs`).
- **Fold review fixes into the commit they belong to.** When a review
  comment or self-review turns up a fix for code in an already-pushed
  commit, fold it into that commit rather than appending an "address
  review" commit — the merged PR keeps its clean, bisectable structure.
  Guardrails: every commit still builds and passes tests after the fold;
  `--force-with-lease`, **feature branch only — never force-push `main`**;
  only while the PR is unmerged (once merged, a fix is a new commit);
  update the matching devlog entry in the same operation. The mechanism
  (reset/amend/rebase) is your judgement.
- **Never squash-merge multi-commit work** — it destroys the atomic
  structure above. Merge with a real merge commit so
  `git log --first-parent` reads as the work-unit narrative and the full
  log holds the atoms. Narrative subjects ("M2+M3: walking skeleton…")
  belong at that merge/PR level.

<!-- /agents-md:managed:commits -->

<!-- agents-md:managed:done -->

## Definition of done for an increment

Each increment is something actively used by the end of the work session —
not "code complete" or "tests pass" alone, but running and exercised.
Before calling work done:

<!-- agents-md:project:done-checks -->

- `npm test` (`node --test`) green
- `npm run lint` (`biome check`) and `npm run format` clean
- `npm run build` (`tsc`) and `npm run typecheck` succeed with no errors
- CLI exercised against a real repo: upload → PR/issue comment round-trip
  produces a rendering image URL (the affected surface in the running tool)
- Output-contract changes verified: `--json` parses, `--raw` is a bare URL,
  stdout stays machine-only and stderr carries the human text
- Security invariants intact for the change: no new subprocess calls, no new
  network destinations, token sanitized on every new error path
<!-- /agents-md:project:done-checks -->

<!-- /agents-md:managed:done -->
