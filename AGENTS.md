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

## Decision Notes (devlog)

`devlog/` holds selected decision records, not session logs. Most work needs
no note. In the ordinary case, keep at most one note per work unit or PR. Name
it `YYYY-MM-DD-HHMM-slug.md`. Follow the protocol in `devlog/README.md`.

- **Write a note only for a lasting decision or discovery.** A note is
  warranted when the work includes at least one of these:

  - A significant, non-obvious decision that rejects a reasonable option.
  - A finding that materially changes the model, policy, risk, or direction.
  - An owner decision that would otherwise exist only in chat.
  - Essential cross-session context that the issue or PR doesn't carry.
  - A change on the project's mandatory-note list, when it has one.

- **Skip notes for routine work.** Implementation, formatting, ordinary docs,
  dependency updates, mechanical syncs, and simple fixes need no note unless
  they reveal a lasting decision or discovery.
- **Record the final reasoning.** Include rejected options, changed
  assumptions, important verification findings, and a "Revisit when ..."
  condition where one is useful. Do not include diffs, test logs, chronology,
  or PR status.
- **Let an active note evolve.** Update it while its work unit or PR is open.
  Freeze it when the PR merges.
- **Find notes from the work first.** Read notes linked from the current issue
  or PR. Otherwise, search by path, topic, contract, or decision name. Read
  the latest note only when resuming the work unit it describes.
- **Treat old notes as evidence, not rules.** Do not silently overturn an
  explicit owner decision. When new evidence conflicts with one, name the old
  decision, explain which assumption or condition changed, and propose the
  revision.
- **Track deferred work in issues.** Link the note from an issue that starts
  there. The note may keep a historical `Follow-up: #N` link, but never a
  second status record. Put non-actionable observations in "Revisit when ...".

<!-- /agents-md:managed:devlog -->

<!-- agents-md:managed:finish-line -->

## Default Agent Finish Line

For changes to code, docs, assets, or project state, finish with an open,
review-ready PR and green required checks. Leave the PR unmerged. Merge only
when the user asks or the project has an explicit self-merge policy.

Before implementation, define a small work contract:

- Objective.
- Testable acceptance criteria.
- Scope.
- Dependencies and blockers.
- Explicit non-goals.

A direct user request needs no issue. The request and PR carry its contract.
Use a tracker issue when the work must:

- Continue in a later session.
- Pass between agents or sessions, even during one short session.
- Coordinate concurrent workers.
- Enter a backlog.

When one agent or session hands work to another, use the issue and its
comments. Put there what the next one needs and what the previous one produced,
not only chat. Before handoff, create an issue for actionable work deferred
beyond the current scope.

A project may define optional work-unit stages in a project-specific section
outside the managed blocks. An active stage controls what may change and where
to stop:

- An implementation stage runs only its allowed checklist steps and stops
  where the active stage says to stop.
- A non-implementation stage follows its own record.
- Finishing one stage hands work off. It doesn't authorize the next stage.
- Work outside a declared stage runs the full checklist, except actions owned
  by another declared stage.

Start work only from an explicit user assignment. An issue, label, backlog
entry, satisfied dependency, completed plan, or claim isn't authorization.
An agent may choose work for itself only when an explicit project policy
allows it.

The implementation checklist:

1. Read the README. When resuming work, also read its issue or PR and linked
   decision notes. Resolve the default branch and update it from its remote.
   Start from that exact tip. Only a declared stacked PR may start elsewhere;
   see Branches.
2. Create a correctly named branch in a dedicated worktree or equivalent
   isolated checkout. See Branches for the primary-checkout exception.
3. Make the scoped change. Include the docs, tests, and assets needed to keep
   it complete. Add a decision note only when its triggers apply.
4. Run relevant verification and the standard lint, build, and test checks.
   Record any check you could not run in the PR.
5. Commit one concern at a time. Explain why in each commit body.
6. Push and open the PR with the template. Remove sections that don't apply.
7. Follow "Handing Off the PR" under Pull Requests. Leave the PR open for a
   human to review and merge.

Before committing work on a destructive path, credential-leak surface, or
returned-object trust boundary, read `docs/agent-workflow.md` §refute-first and
run its verification pass. A destructive path includes delete or cleanup. A
returned-object trust boundary is where code trusts fields returned by an
external call or deserializer. This extra pass doesn't apply to a docs typo or
unrelated refactor.

<!-- /agents-md:managed:finish-line -->

<!-- agents-md:managed:context -->

## Context Discipline

Working context is limited. Content added now is sent again with later tool
calls, so early noise makes every later step more expensive. Keep durable
state in files, such as the issue, PR body, or decision note. Keep only what
the current step needs in working context.

- **Keep raw bulk out.** Prefer a relevant file section, match list, or
  filtered log tail over a whole file or unfiltered output.
- **Delegate broad reading when supported.** Use a delegate for large searches
  or mechanical sweeps only when the platform and session permit it. Ask for
  conclusions, `file:line` references, and a short summary, never raw output.
- **Use bounded reads when delegation is unavailable.** A few targeted reads
  are also better than a delegate for a small question.
- **Match the delegate to the task.** When you can choose a model or effort
  level, use the cheapest capable option for mechanical reading. Skip this when
  the platform offers neither choice.
- **Explain large parallel work first.** One delegate for exploration or
  review is normal. Before using more, state the expected scale and get the
  user's approval or stay within a budget they already set.
- **Suggest a fresh session at a natural boundary.** After a PR handoff,
  review round, or work unit, a long session adds little value. Suggest a new
  session seeded with the PR number. The PR and decision note carry the state.

<!-- /agents-md:managed:context -->

<!-- agents-md:managed:communication -->

## Writing for Humans

People scan human-facing work such as handoffs, PRs, issues, plans, reviews,
and questions. Make the important point clear without requiring them to
translate agent jargon or search for the conclusion.

- **Lead with the bottom line.** Start with the conclusion, decision, or ask.
  Include any assumption or caveat that could change it. Put support below in
  order of importance.
- **Front-load each unit.** Begin every heading, bullet, and paragraph with
  its key words.
- **Layer detail.** Keep the decision in the skim layer. Put evidence,
  options, and detail below it or in a linked issue or note. Do not remove
  needed evidence just to make the text shorter.
- **Ask about three questions per round.** Start with questions that block the
  work. Give each a recommended answer and one-line reason. Turn questions
  with a safe default into visible assumptions the reader can reject. Save
  remaining blocking questions for the next round.
- **Reserve flags for meaningful risk.** Label severity when useful. Flag
  facts that change the decision or confidence in the result. Make rare,
  critical warnings easy to notice.
- **State uncertainty plainly.** Say what was not verified and what remains
  uncertain. Clear writing must not make weak evidence look conclusive.

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

All work lands through a PR. Resolve the default branch (`main` in the
examples) and update it from its remote. Then create an ordinary work-unit
branch from that exact tip. Never start from the current feature branch. Only
a declared stacked PR may use another base.

Use atomic commits and a real merge commit. Let a human decide when to merge.
Never commit directly to `main`, even for a small change. Direct commits break
the `--first-parent` history.

Name a branch `<type>/<short-kebab-slug>`:

- Choose a Conventional Commits type: `feat`, `fix`, `refactor`, `docs`, or
  `chore`.
- Use two to four kebab-case words for the work unit.
- Use exactly one slash. A bare `feat` can't coexist with `feat/x`.
- Omit ticket numbers, dates, and owner prefixes.
- Add an owner segment, such as `bnw/feat/...`, only when several people or
  agents work in parallel.

Examples:

```text
feat/worksheet-promotion
fix/pane-focus-race
chore/swift-format-sweep
```

Merged branches may auto-delete. If the repository doesn't do that, delete
the branch after merge.

**Plan concurrency before creating worktrees.** Keep coupled work in one work
unit, an explicit dependency chain, or a declared stack. Separate worktrees do
not make dependent changes safe to run in parallel. Before substantive work,
use the project's claim visible on the code host for an assigned concurrent
unit, when one exists. A claim only tells others that someone is already
working; it isn't permission to start.

**Isolate every implementation work unit.** Use a dedicated worktree or an
equivalent separate checkout when the platform and session support one. Create
it from the freshly updated default-branch tip. For example:

```sh
git worktree add <path> -b <type>/<slug> <default-branch>
```

Use the primary checkout only when the user or project requires it, or the
platform can't create another checkout. This can happen with no multi-checkout
support or a sandbox pinned to one directory. In that case, serialize work on
one correctly based branch, report the exception, and never run concurrent work
units in that checkout.

After merge, remove the worktree while standing outside it:
`git worktree remove <path>`.

Work that depends on an open PR may stack on its branch. See Stacked PRs under
Pull Requests.

<!-- /agents-md:managed:branches -->

<!-- agents-md:managed:pull-requests -->

## Pull Requests

One PR represents one work unit. Review it as a whole and merge it with a real
merge commit. Commits explain each atomic decision; the PR explains the full
change.

- **Write an imperative title of at most 72 characters.** Name the outcome,
  without a type prefix, ticket number, or other tracking text. The title and
  PR number become the whole merge-commit message in the intended setup. Write
  it for `git log --first-parent`.
- **Use the PR template for the body.** Include Why, What, Screenshots for UI
  changes, optional Review Notes, and Verification. Key the commit map by
  subject, not SHA. Start verification bullets with `Passed:`, `Checked:`,
  `Attempted:`, or `Not run:`. Before writing or updating the body, read
  `docs/agent-workflow.md` §pr-body. For a UI change, meet its Screenshots
  requirements.
- **Self-review the full diff in the PR files view.** Look for stray changes,
  debug code, scope creep, and accidental files. This catches accidental
  changes; it doesn't check whether the solution is correct.
- **Repeat integration checks when the base moves.** CI, final diff review,
  and readiness count only for the base commit you checked. Repeat all three
  if the base changes.
- **Use fresh eyes for substantive review.** Reviewing your own work in the
  same conversation shares the author's blind spots. A review in a fresh
  conversation is more independent. A bot from another provider or a human is
  stronger. Rely on a bot or human before handoff. For non-trivial work, or
  without a bot reviewer, read `docs/agent-workflow.md` §pre-push-review before
  pushing.
- **Record an automated reviewer you observe.** If the project has no record
  for that reviewer or signal, read `docs/agent-workflow.md` §reviewer-record
  and update the project record before handoff.
- **Judge review comments on their merits.** Fix real findings. Decline
  speculative, contrived, or already-fixed findings with a one-line reason.
  Do not comply automatically.
- **Reply after the fix is final and pushed.** Reply inline with the outcome:
  the final commit SHA for a fix, or the reason for a decline. Then resolve the
  thread. Fold all fixes from one round into their owning commits and push once
  before replying. Resolving every thread isn't a merge gate; a reasoned
  outcome is.
- **Fix the whole defect class.** Search the file and repository for the same
  pattern and fix every instance in one push. For validation or parsing code,
  read `docs/agent-workflow.md` §review-convergence before widening a pattern.
- **Keep reviewing while blockers remain.** Correctness, security, data loss,
  broken invariants, and red CI always require another round. Decide severity
  yourself; the reviewer's label is only evidence. When unsure, treat the
  finding as blocking.
- **Raise the bar as rounds continue.** After the early rounds, or when a
  finding recurs, read `docs/agent-workflow.md` §review-convergence before
  deciding on another round. Before handoff, mark every finding fixed,
  declined, deferred, or explicitly outstanding.
- **Keep the PR body current.** When review adds commits or changes scope,
  update What, the subject-based commit map, and Verification. Mark commits
  that resolve review findings. Keep each finding's outcome in its inline
  reply, not a permanent feedback section.
- **Keep the intended repository rules.** Use merge commits only, disable
  squash and rebase merges, use title-only merge messages, and auto-delete
  merged branches. Do not re-enable a disabled method. Enforce these rules
  manually where repository settings don't.

### Handing Off the PR

A PR is ready to hand off when it's open, green, self-reviewed, has no
unhandled threads, and has no outstanding review activity. After opening the
PR, read `docs/agent-workflow.md` §handing-off and follow its sequence:

1. Start the review watch from the PR open or push event. Only reviewer
   activity after that event counts as new. After another push, start counting
   from that push.
2. Refresh from the current base and record the base commit.
3. Wait for required checks. Never hand off known-red work.
4. Self-review the final diff.
5. Close the watch by handling findings or recording its bounded timeout.
6. Stop and summarize for the human reviewer.

If the user asks you to merge, read
`docs/agent-workflow.md` §merge-and-resync first and follow it step by step.
Do not merge or resync from memory.

### Reviewing a PR

Before reviewing a PR, read `docs/agent-workflow.md` §reviewing-a-pr and use
its review bar.

### Stacked PRs

Before creating a branch or PR that depends on another open PR, read
`docs/agent-workflow.md` §stacked-prs. Name the base explicitly; never inherit
it from the current checkout.

<!-- /agents-md:managed:pull-requests -->

<!-- agents-md:managed:commits -->

## Commits

History supports diagnosis, review, and learning. Keep each commit useful for
all three.

- **Keep one concern in each commit, and keep every commit green.** Split a
  commit whose body needs separate labels such as Correctness and Performance.
  Each commit must build and pass tests on its own. Never leave a red
  intermediate state that breaks `git bisect`.
- **Explain why in the body.** Use specific body text wrapped at 72
  characters. Link the work unit's decision note when one exists. Report a
  meaningful change as a delta, such as "27 to 36 tests", not an absolute
  claim such as "36 tests green" that will go stale.
- **Never commit secrets.** Keep credentials, tokens, keys, and `.env` values
  out of commits. Name the secret and use a placeholder in examples.
- **Separate mechanical churn.** Put formatting, renames, and moves in their
  own commit. Add that commit to `.git-blame-ignore-revs` in the same change,
  then enable it locally with
  `git config blame.ignoreRevsFile .git-blame-ignore-revs`.
- **Fold review fixes into the commit that caused them.** This includes issues
  found by review or self-review. Do not append an "address review" commit.
- **Keep every folded commit green.** Fold only on an unmerged feature branch.
  After merge, use a new commit. Update the matching active decision note in
  the same operation when one exists.
- **Force-push safely after a fold.** Use `--force-with-lease` on the feature
  branch. Never force-push `main`. The reset, amend, or rebase mechanism is
  your choice.
- **Push before replying to review.** The inline reply must cite the final,
  pushed SHA that contains the fix. A separate review-fix commit left on the
  branch means the fold is unfinished.
- **Never squash-merge multi-commit work.** Use a real merge commit so
  `git log --first-parent` shows the work-unit story and the full log preserves
  its atomic commits. Put narrative subjects such as "Walking skeleton:
  end-to-end flow" at the merge or PR level.

<!-- /agents-md:managed:commits -->

<!-- agents-md:managed:done -->

## Definition of Done for an Increment

An increment is done only when it's running and exercised by the end of the
work session. "Code complete" or passing tests alone isn't enough.

Before calling the work done, confirm that the build succeeds, tests pass,
and lint and formatting are clean.

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
