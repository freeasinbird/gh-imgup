# AGENTS.md

`gh-imgup` is a zero-dependency TypeScript CLI that uploads images to
GitHub issues and PRs via the documented Release Assets API, built for
agents and CI that need to attach screenshots (especially before/after
UI images) to PRs for human reviewers. The full specification lives in
[README.md](README.md) and the design history in `docs/`. This file is
the single source of truth for development conventions: branch naming,
pull requests, commits, build commands, and the security invariants that
define the project. It serves both human contributors and automated
agents.

Agent-setup profile: High-assurance. A decision note is mandatory for
changes touching: destructive cleanup or deletion behavior; credential
and secret-leak surfaces; returned-response, deserialization, or
remote-service trust boundaries; network destination and upload-routing
decisions; CLI output contracts consumed by automation; and security or
release-policy changes.

<!-- agents-md:managed:devlog -->

## Decision notes (devlog)

`devlog/` holds selective decision records, not session logs: at most
one note per work unit or PR in the ordinary case, named
`YYYY-MM-DD-HHMM-slug.md`. `devlog/README.md` is the protocol; most
work needs no note.

- **Write or update a note only when** the work involves at least one
  of: a consequential, non-obvious decision that rejects a plausible
  alternative; an investigation or verification result that materially
  changes the model, policy, risk, or implementation direction; a
  durable owner choice that would otherwise exist only in chat;
  cross-session context the work unit's PR or issue genuinely doesn't
  carry; or a change on the project's mandatory-note list, where it
  keeps one. Routine implementation, formatting, ordinary docs,
  dependency maintenance, mechanical syncs, and uncomplicated fixes
  need no note unless they reveal something consequential.
- **Content**: final rationale, rejected alternatives, changed
  assumptions, significant verification findings, and a "Revisit
  when ..." condition where one is useful; not commit diffs, test
  transcripts, or PR status. A note may evolve while its work unit or
  PR is active; it freezes on merge.
- **Retrieval**: read the notes linked from the issue or PR at hand;
  otherwise search by affected path, topic, contract, or decision
  name. Read the latest note only when resuming the work unit it
  describes. Prior notes are evidence, not prohibitions: do not
  silently overturn an explicit owner decision; if new evidence
  conflicts with one, identify the prior decision, state which
  assumption or condition changed, and surface the proposed revision.
- **Actionable deferred work goes to the issue tracker**, not the
  note. When an issue originates from a note, link the note from the
  issue; the note may carry a plain historical `Follow-up: #N` link,
  never a second source of status. An observation that is not yet
  actionable becomes a "Revisit when ..." statement, not open work.

<!-- /agents-md:managed:devlog -->

<!-- agents-md:managed:finish-line -->

## Default agent finish line

For any request to change code, docs, assets, or project state, the
default endpoint is **an open, review-ready PR with required checks
green**, not a merged branch. Merging is a human decision; do not merge
your own PR unless the user explicitly asks, or the project has adopted
an opt-in self-merge workflow.

Before implementation, establish a lightweight work contract: objective,
testable acceptance criteria, scope, dependencies and blockers, and explicit
non-goals. Direct user-assigned work needs no issue; the prompt and PR
carry the contract. Persist it in a tracker issue when the
work must survive a session boundary, pass sequentially between agents or
sessions (even within one short session), coordinate concurrent workers, or
join a backlog; a sequential handoff puts the durable input and output in
the issue and its comments, never only in transient chat. Actionable work
deferred out of the unit's scope gets a tracker issue before handoff.

A project may declare optional work-unit stages in an unmanaged,
project-specific section. While a declared stage is active, its recorded
allowed mutations and finish line govern: an implementation stage runs
only the checklist steps they permit and stops at its recorded
transition, a non-implementation stage follows its own record instead,
and completing a stage hands off to the next without authorizing it to
begin. Work that is not a declared stage runs the checklist in full,
minus any action a separately declared stage owns.

By default, begin work only through explicit user assignment. An issue, label,
backlog entry, satisfied dependency, completed plan, or claim is not
authorization to select and start work. Agent self-selection requires an
explicit project-specific opt-in policy.

The implementation checklist:

1. Read the README and, when resuming a work unit, its issue or PR and any
   decision note they link. Resolve the default branch explicitly, update it
   from its remote, and start from that exact tip (see Branches; only a
   declared stacked PR starts elsewhere).
2. Create one correctly named branch from that tip in a dedicated worktree
   or equivalent isolated checkout (see Branches for the primary-checkout
   exception).
3. Make the scoped change, with the docs/tests/assets that keep it complete
   and, where the project keeps decision notes, a note when the work meets
   its triggers.
4. Run the relevant verification plus the standard lint/build/test checks;
   if any check cannot run, record the exact gap in the PR.
5. Commit one concern at a time with a body that says why.
6. Push, open the PR with the template, and remove sections that do not apply.
7. Hand off per "Handing off the PR" (under Pull requests); leave the PR
   open for a human to review and merge.

For changes on a **destructive path** (delete/cleanup), a
**credential-leak surface**, or a **returned-object-trust boundary**
(trusting fields of a value handed back by an external call or
deserializer), read `docs/agent-workflow.md` §refute-first before
committing and run the verification pass it describes; a docs typo or
an off-path refactor doesn't trigger it.

<!-- /agents-md:managed:finish-line -->

<!-- agents-md:managed:context -->

## Context discipline

The working context is finite, and everything held in it is re-sent
with every later tool call, so transient bulk pulled in early taxes
every step after it. Durable state belongs in files (the PR body, the
issue, a decision note where the project keeps one); keep the working
context to what the current step needs.

- **Keep raw bulk out.** Prefer targeted, bounded reads and searches
  (a file region, a match list, a filtered log tail) over whole-file
  dumps and unfiltered search output; don't page a large artifact into
  context when a bounded query answers the question.
- **Delegate broad exploration.** Where your platform and session
  support delegation, offload broad exploration and mechanical sweeps
  to a delegate that returns conclusions (findings, `file:line`
  pointers, a short digest), never its raw output. Where they don't,
  fall back to the bounded reads and searches above. Scale to size
  either way: for a question a couple of targeted reads can answer,
  spawning a delegate costs more than it saves.
- **Right-size delegated work.** Where the platform exposes a model
  class or effort level for delegated work, send mechanical scanning
  and digesting to the cheapest class that handles it reliably;
  frontier capability spent on rote reading is waste. Where it
  doesn't, skip this.
- **No quiet fan-out.** One delegate for exploration or review is
  normal. Parallel multi-agent fan-outs multiply cost invisibly;
  before launching one, state the expected scale and proceed with the
  user's go-ahead or within a budget they already set.
- **Prefer a fresh session over a bloated one.** The PR body (plus a
  decision note when one exists) carries the durable state, so at a
  natural boundary (a PR handed off, a review round closed, a new work
  unit) in a long session, suggest continuing in a fresh session
  seeded with the PR number rather than pushing on; the accumulated
  context adds little to the next unit and dominates its cost.

<!-- /agents-md:managed:context -->

<!-- agents-md:managed:communication -->

## Writing for humans

Humans scan rather than read: a fifth of the words, weighted toward
first lines and line-starts, about four open items in mind, rapid
tune-out of repeated warnings. Write every human-facing artifact
(handoff, PR body, issue, plan, review comment, question) for that
reader; never rely on them digging.

- **Bottom line first.** Open the artifact with its conclusion,
  decision, or ask, along with any assumption or caveat it stands or
  falls on; supporting material follows in descending importance. A
  reader who stops after the opening still acts correctly.
- **Front-load every unit.** The first words of a heading, bullet, or
  paragraph carry its information.
- **Layer, don't just shrink.** The artifact is also the durable
  record: the skim layer carries the decision, while evidence,
  alternatives, and detail live below it or in the linked note or
  issue, never cut to shorten the skim layer.
- **Few asks per round, with defaults.** Surface the questions that
  gate the work, about three at a time, each with a recommended answer
  and a one-line reason. Convert questions a sensible default settles
  into visible assumptions the reader can veto; queue the remaining
  gating questions for a later round rather than assuming through
  them.
- **Ration flags, and calibrate them.** Tag severity, flag what
  changes the reader's decision or how much to trust the result, and
  make rare critical warnings visually distinct; a page of routine
  hedges buries the one that matters.
- **Surface uncertainty; don't polish past it.** State what was not
  verified and where you are unsure, so the human's attention lands
  where checking is needed; fluent prose invites rubber-stamping.

<!-- /agents-md:managed:communication -->

## Build, test, run

- **Runtime:** Node.js 22+ (global `fetch`, `node:test`). CI runs Node 22 and 24;
  the build/test path targets compiled output, so it also runs on Node 20
  for local development.
- **Package manager:** npm. Published as an npm package; also distributed
  as a `gh` CLI extension and an agent skill (all three point at the same
  compiled `dist/`).
- **Zero runtime dependencies.** `package.json` carries only
  `typescript` and `@types/node` as devDependencies (Biome is added as a
  devDependency for lint/format, see below). The published artifact uses
  Node built-ins and global `fetch` only.

Intended npm scripts (single command each, runnable in CI):

| Task        | Command            | Notes                                              |
| ----------- | ------------------ | -------------------------------------------------- |
| Build       | `npm run build`    | `tsc`: compiles `src/*.ts` → `dist/`              |
| Type-check  | `npm run typecheck`| `tsc --noEmit`                                     |
| Test        | `npm test`         | builds, then `node --test dist/*.test.js` (built-in runner + `node:assert`); tests run against compiled output, not type-stripped source |
| Lint        | `npm run lint`     | `biome check .`                                    |
| Format      | `npm run format`   | `biome format --write .`                           |
| Run (local) | `node dist/index.js <file...> [options]` | or `npx -y @freeasinbird/gh-imgup …` once published |

- **CLAUDE.md is a pointer** that imports this file (`@AGENTS.md`). Edit
  AGENTS.md, never the pointer.
- **CI** (`.github/workflows/ci.yml`) runs `npm run lint`, `npm run typecheck`,
  and `npm test` (which builds) on a Node 22/24 matrix on every PR and push to
  `main`. The workflow conventions below assume these checks exist and gate
  merges; keep them green and don't remove the gate. Branch protection on
  `main` enforces this: a PR with the `check` job green is required to merge,
  admin-enforced (no direct pushes to `main`, even for the owner).
  Deliberately deferred: an OS matrix (macOS/Windows), revisit when a
  platform-specific bug shows; a coverage-threshold gate, revisit when
  baseline coverage numbers exist.
- **The `check` job is a fail-closed fan-in gate; keep its name and shape.**
  Branch protection requires the context named `check`, so the matrix reports
  through a fan-in job that keeps that exact name. Its `if: always()` plus the
  explicit `needs.test.result == "success"` test are load-bearing: a plain
  `needs:` job is skipped when a matrix leg fails, and GitHub treats a skipped
  required check as satisfied, so simplifying the condition makes the gate
  fail open. Renaming the job breaks merging entirely (the required context
  never reports).

## Releases

Published to npm as `@freeasinbird/gh-imgup` (scoped under the org), `0.x` until
the output contract is deliberately frozen at `1.0` (see the versioning bullet
under Conventions & gotchas).

- **Publishing is OIDC Trusted Publishing: no `NPM_TOKEN`.**
  `.github/workflows/release.yml` triggers on a `vX.Y.Z` tag, runs with
  `id-token: write`, upgrades to npm ≥ 11.5.1 (OIDC requires it), and
  `npm publish`es; provenance is automatic (no `--provenance` flag). The trusted
  publisher is configured on npmjs.com (this repo + `release.yml`, environment
  blank, allowed action `npm publish`).
- **Scoped packages publish PRIVATE by default**: `publishConfig.access:
  "public"` in `package.json` is load-bearing; don't remove it. (`prepack` builds
  `dist/` at publish time and `prepublishOnly` gates it, see the packaging
  gotcha under Conventions.)
- **Cutting a release:** bump the `package.json` version in a PR, then push the
  matching `vX.Y.Z` tag; `release.yml` publishes. The publish step is idempotent
  (skips when that version is already on the registry), so re-tagging is safe;
  the first `v0.1.0` tag (the package was published manually first) was a green
  no-op for this reason.
- **The version-bump PR also updates the README pinned examples.** The two
  runnable, fully-qualified pins (`npm i -g @freeasinbird/gh-imgup@X.Y.Z` and
  the CI `npx -y @freeasinbird/gh-imgup@X.Y.Z` example) track the release;
  find them with `grep -n 'gh-imgup@0' README.md`. The ellipsized `…@0.1.0`
  allowlist illustrations (here and in the README pre-authorize section) are
  deliberately version-agnostic and don't track releases.
- **After pushing the tag, create the GitHub release for it:**
  `gh release create vX.Y.Z --verify-tag --title vX.Y.Z --notes "<short prose
  summary of the CHANGELOG entry>"`. npm publishing is tag-triggered and
  doesn't need it, but the releases page is user-facing: this step was missed
  for v0.1.2 and v0.1.3 (backfilled 2026-07-01), leaving "Latest" pointing at
  v0.1.1. Notes-only, normal (non-prerelease) releases; never attach assets
  (see the `<os>-<arch>` gotcha under Conventions).
- **A version bump must also commit `package-lock.json`.** `npm version` updates
  both files, but a commit that stages only `package.json` leaves the lockfile
  behind: its root and `packages[""]` `version`/`name` must keep matching
  `package.json` (`@freeasinbird/gh-imgup` / the new version). `npm ci` fails on
  drift. This bit once: a 0.1.1 bump that staged only `package.json` shipped with
  the lockfile still at `0.1.0` (and the pre-scope `gh-imgup` name). Use
  `git add -A` for the bump, or stage the lockfile explicitly.
- **The first publish was manual**: the trusted publisher can only be configured
  on an already-published package; every release after is the tag flow above.
- Never attach `*-<os>-<arch>` release assets: it flips `gh extension install`
  into binary mode (see the gh-extension gotcha under Conventions).

## Architecture invariants

These rules protect the project's security model, its entire reason for
existing over the alternatives. Each states what it prevents and how it's
enforced. Violating one is a security regression, not a style nit.

1. **GitHub API access is `fetch()`-only: no shell for GitHub ops.**
   Prevents shell injection structurally rather than defending with
   escaping. The compiled CLI makes exactly **two** subprocess calls ever:
   `execFileSync('gh', ['auth', 'token'])` and
   `execFileSync('git', ['remote', 'get-url', 'origin'])`, both with array
   args (no shell), no user input in the array, guarded by try/catch and a
   5s timeout. Adding a third subprocess call, or string-interpolating into
   either, breaks the invariant. (The `gh`-extension wrapper is a separate
   thin bootstrap shell script that builds/locates `dist/` and forwards args
   to `node`; it interpolates no user input. Scope security claims to the
   compiled CLI vs. the wrapper accordingly; docs that conflate them are
   wrong.)

2. **Zero runtime dependencies.** Keeps the supply-chain audit surface to
   the tool itself plus Node built-ins. Enforced by `package.json` declaring
   no runtime `dependencies`; reviewers reject any runtime dep.

3. **No credential leaks in output.** Every error/echo path strips
   credentials before they reach stderr, CI logs, or agent context: both
   the resolved API token AND any credentials embedded in a git-remote URL
   (userinfo). Error-path redaction is decode-aware: a value is redacted if
   it decodes to the token literally or through `%XX` / JS-JSON `\uXXXX`
   escapes, and control characters (C0/DEL/C1, line/paragraph separators)
   are collapsed so a tampered response can't forge log lines. These defenses
   live in `apierr.ts` (`decodesToToken` / `redactField` / `redactBody`, with
   `sanitize` in `auth.ts` and the shared `collapseControls` in `markdown.ts`);
   any new path that prints an API response or a response-derived value must
   route through them. `redactBody`'s decode scan is bounded (`MAX_SCAN`), and
   the containment is load-bearing: the echoed prefix (`MAX_DETAIL`) must stay
   strictly inside the scanned window, so never raise `MAX_DETAIL` to or past
   `MAX_SCAN` (that silently breaks the no-leak argument). Separately, the PUBLIC
   comment surface refuses to post a body whose token appears in a *rendered*
   form, HTML entities (named/numeric/zero-padded) or backslash escapes,
   via `github.ts` `renderInlineMarkdown` (the normalization cleanup matching
   also uses). That is a refusal, not error redaction: `apierr.ts` does not
   decode HTML entities, so don't claim the error path does.

4. **No third-party destinations; HTTPS-only; no client redirects.**
   Requests go to exactly `api.github.com` and `uploads.github.com`, over
   HTTPS (the token never traverses plaintext, even to an allowed host),
   with `redirect: 'error'` (a redirect elsewhere fails rather than being
   silently followed). On the `--cleanup` destructive path the `Link` rel=next
   pagination URL is not just re-checked against the host allowlist but bound to
   the surface being scanned: same endpoint, same repo (accepting GitHub's
   numeric `/repositories/{id}` rewrite, re-bound to this repo's id), original
   query preserved, page advancing by exactly one, with the opaque `after`
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
   URL(s), or JSON to stdout: `--json` is **always a JSON array** (one
   object per file, even for a single file) so consumers parse one stable
   shape; all progress, warnings, and errors to stderr. Exit 0 only when
   every upload succeeded. Don't print human chatter to stdout.

8. **On a destructive path, match the fully-decoded form and fail toward
   keeping.** When deciding whether an asset may be DELETED by matching it
   against rendered/encoded text (its URL/name vs. an issue/PR body),
   normalize both sides through the full decode stack GitHub can apply:
   raw, Markdown-rendered (named + numeric HTML entities, backslash
   escapes), and percent-encoding (case-insensitive, multi-byte UTF-8), and
   treat any ambiguity as *referenced* (keep). Over-decoding only over-keeps
   (safe); a missed reference deletes a live image (not). Non-ASCII-named
   assets are kept rather than matched (the full named-entity table isn't
   decoded). This biasing applies to the destructive/match direction only.

9. **Trust no response-derived URL without re-binding it to the target.**
   Before echoing or acting on a URL from an API response, validate it
   against the target: host + owner/repo + path shape + id (e.g.
   `isUsableAssetUrl`, `usableCommentUrl`), not just the host. A malformed,
   off-repo, or tampered URL is rejected (dropped, or the run aborts on a
   destructive path), never reported or deleted-by. The shared checks
   (printable ASCII, https on github.com, no creds/port/query, canonical
   `href === value`, owner/repo binding) live in `boundGithubUrl`
   (`validate.ts`); any new response-URL validator must route through it and
   add only its endpoint-specific binding on top.

## Conventions & gotchas

- **Automated PR reviewer: Codex.** ChatGPT Codex reviews every PR
  automatically on push; no manual trigger (don't post `@codex review`).
  Its review-author login is `chatgpt-codex-connector[bot]` (REST API form,
  `type: Bot`); filter review activity by that login. **A no-findings review is
  a 👍 (`+1`) reaction on the PR, not a review or comment**, so a watch keying
  only on reviews/comments misreads a clean pass as "no review": also poll
  reactions (`gh api repos/OWNER/REPO/issues/<pr>/reactions`). Codex only starts
  tracking a PR on an open / ready / `@codex review` event, so a PR opened on a
  non-`main` stacked base can be skipped until you fire one (toggling draft to
  ready via `gh pr ready --undo` then `gh pr ready` is the convention-respecting
  trigger). Per-finding response conventions live under Pull requests.
- **Versioning: `0.x` until the contract is deliberately frozen at `1.0.0`.**
  The first publish is `0.x` (a soft launch while real-world usage accrues). The
  CLI surface and the machine-output contract (invariant 7) are stable by intent
  (avoid gratuitous breaks) but `0.x` signals the formal semver promise isn't
  made yet. `1.0.0` freezes that contract and is a deliberate human call once
  usage justifies it; don't bump to `1.0` (or break the contract assuming a minor
  may) without that decision. See issue #16.
- **Prerelease, never draft.** The `_gh-imgup` release must be a
  prerelease: draft releases can't be resolved by tag, so asset
  `browser_download_url`s 404. This is load-bearing, not a preference.
- **Release tags must start with `_`.** `validateTag` rejects anything
  else, preventing `--tag v2.0.0` from polluting real releases. Default is
  `_gh-imgup`.
- **Create-or-get is race-safe.** Two concurrent runs both see 404 and try
  to create; one gets 422. On 422 (tag exists), retry the GET; on 422 for
  any other reason, fail with the original error.
- **`--cleanup` is fail-safe and interactive: no `--yes`.** It scans five
  repo-wide surfaces (issue/PR bodies, their comments, inline PR review
  comments, commit comments, release notes), not wikis, repo files,
  Discussions, or off-GitHub, so it can't prove completeness. Any scan or
  listing error aborts *before* any delete; matching only ever false-*keeps*
  (never false-deletes); each asset is re-fetched by id to confirm it still
  hosts the matched URL+name before deletion; it refuses to run without a TTY
  (no piped `y`); and it keeps non-ASCII-named assets (invariant 8). Per-asset
  manual removal is `gh release delete-asset <tag> <name>`; whole-release
  deletion (`gh release delete`) is intentionally never automated: it breaks
  every embedded image.
- **Three distribution channels, one codebase.** npm package, `gh`
  extension wrapper (root `gh-imgup` shell script), and `skills/gh-imgup/SKILL.md`
  all point at the same compiled `dist/`. Keep them in sync.
- **Two supported agent/CI invocations: keep both exact.** Zero-install
  `npx -y @freeasinbird/gh-imgup …` is canonical: `-y` is load-bearing (without
  it npx's first-run `Ok to proceed?` prompt hangs a non-interactive agent/CI
  job) and the `@freeasinbird/` scope is mandatory (a bare `npx gh-imgup` is a
  *different*, unscoped registry package). The **pinned pre-installed** bare
  `gh-imgup` is the recommended low-friction path for repeat use and for
  approval reviewers that refuse unpinned npx (Codex): `-y` doesn't help there,
  it only suppresses npx's own prompt, not a model-based approval gate. Each form
  has its allowlist string: Claude Code `Bash(gh-imgup *)` (pinned) /
  `Bash(npx -y @freeasinbird/gh-imgup *)` (npx; the space before `*` won't match
  a pinned `…@0.1.0`); Codex persistent prefix `["gh-imgup"]` (Codex won't
  auto-run npx at all). Don't drift the docs/SKILL invocations or these allow
  strings off each other across README/SKILL/AGENTS. See the README
  "Pre-authorize for agents" section. In Claude Code auto mode a safety
  classifier gates whatever no narrow allow rule resolves (second gate,
  after permissions): the pinned `Bash(gh-imgup *)` rule carries over and
  covers the bare pinned form, but the npx form was denied even with its
  allow rule present, and an env-prefixed command matches no rule. Those
  need a user-added `autoMode.allow` entry (snippet and constraints in the
  README section); in testing the agent couldn't write it from inside auto
  mode, and a repo's checked-in `.claude/settings.json` can't carry it.
  Revisit when field data shows another host's auto/approval mode needs an
  equivalent documented path.
- **Never attach a release asset whose name ends in a platform `<os>-<arch>`
  suffix** (`*-darwin-amd64`, `*-linux-amd64`, `*-windows-amd64.exe`, …), and
  that's _any_ asset, not just a `gh-imgup-<os>-<arch>` binary. The `gh`
  extension is **source-install only** (gh clones the repo and runs the root
  `gh-imgup` script). `gh extension install` flips to binary-download mode the
  moment the latest release carries _any_ asset whose name ends in a known
  `<os>-<arch>` suffix; that's the `isBinExtension` check in `cli/cli`
  (`pkg/cmd/extension/manager.go`): it `strings.HasSuffix`-matches every asset
  name against `possibleDists()` with **no `gh-imgup-` prefix requirement**, and
  doesn't care whether a release exists. So a stray helper artifact (a checksum
  file, an SBOM, …) named `…-linux-amd64` would trip it just as a real binary
  would. A normal versioned `vX.Y.Z` release with notes is fine and does NOT
  break the extension (GitHub's auto source tarballs aren't in the `assets`
  array); just keep every attached asset's name clear of those suffixes. We ship
  no precompiled binaries (a per-platform bundled Node runtime would undercut the
  zero-runtime-dep model), see issue #14. Going binary later is a deliberate,
  separately-reviewed switch.
- **`dist/` is gitignored, so packaging builds it at pack time.** The `prepack`
  script (`npm run build`) is load-bearing: the npm `bin` points at
  `dist/index.js`, and without the hook `npm pack`/`npm publish` from a clean
  checkout would ship a tarball with no `dist/` (only LICENSE/README/manifest),
  a broken install. Don't remove `prepack`. The `files` array also excludes
  `dist/**/*.test.js` (the compiled tests live in `dist/` for `npm test` but
  must not ship); verify with `npm pack --dry-run --json`.
- **The SKILL.md pre-upload image review is a security control**, not
  documentation filler: it's the highest-impact mitigation in the system
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
  record which findings were confirmed, rejected-by-verification, or
  accepted-by-decision: in the work unit's decision note when the change
  carries a decision on the mandatory-note list, otherwise in the PR.
  Scope this to those risk classes, not every change.
- **Docs are audited against the code.** README/SECURITY/CHANGELOG claims
  (counts, flags, behaviors, the subprocess/network guarantees) are checked
  against `src/`, scoped to the surface they describe (the compiled CLI and
  the `gh`-extension wrapper differ), and stated plainly: no marketing, no
  unverifiable claims about other tools. Same "facts only" discipline as
  Verification, applied to shipped docs.
- **Authoring control-char / escape regexes through the edit tooling is
  unreliable.** A character class with control chars, `\uXXXX` escapes, or a
  `\x00-\x7f` range can have its escapes decoded into literal bytes (or the
  range mangled) by the editor/JSON layer. Write such regexes via a node
  script (or use `codePointAt` scans instead of escape ranges) and byte-audit.
- **npm scripts must be cross-platform.** npm runs scripts under `cmd.exe` on
  Windows, where Unix tools (`rm`, `cp`, `test`) aren't available; `test` and
  `prepack` depend on these scripts, so a Unix-only command breaks Windows
  contributors and pack/publish runs before the build even starts. Use Node
  one-liners instead (the `clean` script's
  `node -e "require('node:fs').rmSync(...)"` is the pattern).
- **I/O is tested via dependency injection.** Modules take their side effects
  (env, the gh/git subprocess, `fetch`, `warn`, `isTTY`, `confirm`) as
  injectable params with production defaults; tests script a fake transport
  *through* the real `authedFetch` and use real temp files for SHA-256. Chosen
  over module-mocking because ESM named imports are read-only bindings.

<!-- agents-md:managed:branches -->

## Branches

All work lands through a PR. Resolve and freshly update the repository's
default branch (`main` below), then create each ordinary work-unit branch
explicitly from that tip, never from the currently checked-out feature
branch; a non-default starting point is allowed only for an intentionally
declared stacked PR. Do the work as atomic commits (see Commits), then open
a PR; it merges with a real merge commit on a human's call. Never commit
directly to `main`, with no triviality exception: every bypass erodes the
`--first-parent` narrative.

Name branches `<type>/<short-kebab-slug>`: type from the Conventional
Commits vocabulary (`feat`, `fix`, `refactor`, `docs`, `chore`), slug
2–4 kebab-case words naming the work unit:

```text
feat/worksheet-promotion
fix/pane-focus-race
chore/swift-format-sweep
```

Exactly one slash (`feat/x` and a bare `feat` can't coexist). No ticket
numbers, dates, or owner prefixes; prepend an owner segment
(`bnw/feat/…`) only if multiple people or agents start pushing in
parallel. Merged branches auto-delete where that repo setting is on;
delete them after merge where it isn't.

**Break down concurrency before isolating it.** Keep coupled work in one work
unit, an explicit dependency chain, or an intentionally declared stack; a
worktree separates checkouts but cannot make logically dependent work safe in
parallel. Before substantive work, an assigned concurrent unit uses the
project's forge-visible claim mechanism, when one is defined. The claim
advertises active occupancy, not authorization; its form is project-specific.

**Isolate every implementation work unit** in a dedicated worktree or
equivalent isolated checkout. Where your platform and session support a
second checkout (a native worktree tool or session flag, or plain
`git worktree add <path> -b <type>/<slug> <default-branch>`), create the
branch and checkout from the freshly updated default-branch tip. Use the
primary checkout only when an explicit user or project instruction requires
it, or when the platform cannot create another checkout (no multi-checkout
support, or a sandbox pinned to one directory); then serialize all work on
one correctly based branch there and report the exception, never running
concurrent work units in one checkout. Remove a worktree once its branch
merges, standing outside the one being removed (`git worktree remove <path>`).

Work that depends on an open PR can stack on its branch instead of
waiting; see Stacked PRs under Pull requests.

<!-- /agents-md:managed:branches -->

<!-- agents-md:managed:pull-requests -->

## Pull requests

A PR is one work unit, reviewed as a whole and merged with a real merge
commit. Commits carry the atomic why (see Commits); the PR carries the
arc.

- **Title**: imperative, ≤ 72 chars, names the outcome, no type prefix
  or ticket noise ("Fix missing menu bar on unbundled launch"). In the
  intended repo setup the title (plus its number) is the _entire_ merge
  commit message; write it for `git log --first-parent` either way.
- **Body**: scaffolded by the repo's PR template
  (`.github/pull_request_template.md` on GitHub): Why, What (outcome bullets and a
  commit map keyed by subject, not SHA), Screenshots (UI changes only),
  Review Notes (optional), and Verification (bullets starting `Passed:`,
  `Checked:`, `Attempted:`, or `Not run:`; facts only). Before writing
  or updating the body, read `docs/agent-workflow.md` §pr-body and meet
  each section's bar (for UI changes, the Screenshots bar).
- **Self-review the diff in the PR files view before handing off**: the
  whole change as one artifact shows stray hunks, leftover debug code,
  scope creep, and accidental files. This is _mechanical hygiene_, not
  substantive critique.
- **Integration evidence belongs to one base commit.** CI results, a
  full-diff self-review, and a ready-for-handoff claim are valid only for
  the base commit they were checked against; a base-branch change
  invalidates all three, however clean the earlier diff looked.
- **Substantive critique needs fresh, ideally non-self eyes**, since
  same-context self-review shares the blind spots that produced the
  code: self-in-context < same-model fresh-context subagent <
  different-vendor bot / human. The bot reviewer or human is the
  load-bearing pass. For a non-trivial change, or a repo without a bot
  reviewer, read `docs/agent-workflow.md` §pre-push-review before
  pushing and run the platform-gated review it describes.
- **Record a noticed automated reviewer.** On seeing a bot-authored
  review or reviewer status signal the project hasn't recorded, read
  `docs/agent-workflow.md` §reviewer-record and add or augment the
  record before handing off.
- **Responding to automated review.** Evaluate each comment on its merits:
  fix real findings; push back, _with a one-line reason_, on contrived,
  speculative, or already-fixed ones; never reflexively comply. Reply
  inline with the disposition and the fixing commit SHA ("Fixed in
  `<sha>`" / a reasoned decline), then resolve the thread. Where fixes
  fold into their commits, fold all of a round's fixes and push once
  before any reply (the fold-then-reply gate in Commits), so every cited
  SHA is the final, pushed one. Resolving every thread is _not_ a hard
  merge gate; evaluate-on-merits is.
- **Fix the class, not just the cited line.** When a finding names one
  location, sweep the file and repo mechanically (grep for the finding's
  pattern, don't just eyeball nearby lines) and fix every instance in the
  same push; the class recurs in sibling sentences and files the citation
  never named. For validation or parsing code the sweep is the
  adversarial input-space enumeration in `docs/agent-workflow.md`
  §review-convergence; read it before widening the cited pattern.
- **Converge on a bar that rises with the rounds.** Blocking findings
  (correctness, security, data-loss, broken invariants, red CI) always
  earn another round; judge that severity yourself, the reviewer's tag
  being input, not verdict, and when unsure treat a finding as blocking.
  Once an exchange passes its early rounds or a finding recurs, read
  `docs/agent-workflow.md` §review-convergence before deciding on
  another. Hand off with every finding dispositioned (fixed, declined,
  deferred, or explicitly outstanding).
- **Keep the body current as review evolves the PR.** The body is the
  work unit's durable record on the forge: when review adds commits or
  shifts scope, update What, the
  commit map (flagging which commits resolve review findings, by
  subject), and Verification before re-handing-off. The inline reply on
  each resolved thread is the per-finding record; don't duplicate it
  into a standing "feedback" section.
- The intended repo settings enforce the Commits rules: merge commits
  only (squash and rebase disabled), title-only merge messages, and
  auto-delete of merged branches. Don't re-enable around them; where
  they aren't set, hold the same rules manually.

### Handing off the PR

Done means open, green, threads handled, self-reviewed, and no new
review activity outstanding. Once the PR is up, read
`docs/agent-workflow.md` §handing-off and follow its sequence:
review-watch per PR/reviewer first, anchored to the open or push event;
base-freshness pass with the base commit recorded; required checks
waited out, never a known-red handoff; self-review; watch closed out
with findings addressed or the bounded timeout recorded; then stop and
summarize.

If the user does ask you to merge, read `docs/agent-workflow.md`
§merge-and-resync before the merge or resync and follow it step by step;
do not merge or resync from memory.

### Reviewing a PR

When asked to review a PR, read `docs/agent-workflow.md` §reviewing-a-pr
first and hold its bar.

### Stacked PRs

Before creating a branch or PR that depends on an open PR, read
`docs/agent-workflow.md` §stacked-prs and declare the base explicitly,
never the current checkout.

<!-- /agents-md:managed:pull-requests -->

<!-- agents-md:managed:commits -->

## Commits

History serves three uses: diagnostics (blame/bisect lead to a
cause), reviewability (a PR reads commit-by-commit), and learning (the
log tells the project's evolution). Rules:

- **One concern per commit, every commit green.** If the body wants
  labeled sections (Correctness:/Performance:/…), it's more than one
  commit; split it. Each commit must build and pass tests on its own;
  never leave red intermediate states (it breaks bisect).
- **Body says why, not just what.** Write dense, specific bodies,
  wrapped ≤ 72 columns, referencing the work unit's decision note when
  one exists. State change deltas ("27 → 36 tests") if meaningful, never
  absolute status ("36 tests green"), which goes stale.
- **Never commit secrets** (credentials, tokens, keys, `.env`
  contents); reference them by name and use placeholders in examples.
- **Mechanical churn commits alone.** Reformats, renames, and moves get
  their own commit, added to `.git-blame-ignore-revs` in the same change
  (activate locally with
  `git config blame.ignoreRevsFile .git-blame-ignore-revs`).
- **Fold review fixes into the commit they belong to.** A fix that
  review or self-review turns up for an already-pushed commit folds into
  that commit, never an appended "address review" commit, keeping the
  merged PR clean and bisectable.
  Guardrails: every commit still builds and passes tests after the fold;
  `--force-with-lease`, **feature branch only, never force-push `main`**;
  only while the PR is unmerged (once merged, a fix is a new commit);
  update the matching decision note, when one exists, in the same
  operation. The mechanism (reset/amend/rebase) is your judgement. The
  fold-then-reply order is a gate: fold and push before writing the
  inline reply to the review thread, so the reply cites the final
  commit SHA, verified reachable from the pushed head; a standalone
  review-fix commit still on the branch at handoff is an unfinished
  fold, not a done round.
- **Never squash-merge multi-commit work**: it destroys the atomic
  structure above. A real merge commit keeps `git log --first-parent` as
  the work-unit narrative and the full log as the atoms; narrative
  subjects ("Walking skeleton: end-to-end flow") belong at that merge/PR
  level.

<!-- /agents-md:managed:commits -->

<!-- agents-md:managed:done -->

## Definition of done for an increment

Each increment is something actively used by the end of the work session:
not "code complete" or "tests pass" alone, but running and exercised.
Before calling work done:

The build succeeds, tests pass, and lint and formatting are clean.

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
