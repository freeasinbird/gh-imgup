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

<!-- agents-md:managed:devlog -->

## Devlog (session bookends)

`devlog/` holds the reasoning trail: one short entry per working
session. `devlog/README.md` is the protocol: entry naming, density
target, structure, and when an entry may be revised.

- **Before starting:** read the most recent one or two entries
  (`find devlog -maxdepth 1 -type f -name '*.md' ! -name README.md | sort | tail -2`);
  they carry decisions and deliberate deferrals that aren't in the spec.
  Don't re-litigate or "fix" what an entry marks as decided/deferred without
  the user asking. Also grep the devlog for the open `## To promote` /
  deferred / needs-human queue so promotions don't span sessions unnoticed.
- **Before finishing:** append `devlog/YYYY-MM-DD-HHMM-slug.md`: decisions
  (why, and what was rejected), deferrals, open questions. Note anything
  that should be promoted to AGENTS.md: a new invariant discovered, a
  convention that wasn't written down, a gotcha that bit you; the entry
  records it, a follow-up commit promotes it. Commits and PR threads carry
  the what-changed.

<!-- /agents-md:managed:devlog -->

<!-- agents-md:managed:finish-line -->

## Default agent finish line

For any user request that asks you to change code, docs, assets, or project
state, the default endpoint is **an open, review-ready PR with required
checks green**, not a merged branch. Merging is a human decision; do not
merge your own PR unless the user explicitly asks, or the project has adopted
an opt-in self-merge workflow.

Use this checklist for each work session:

1. Read README plus the latest devlog entries, then start from `main`, or,
   for a follow-up that depends on an open PR, from that PR's branch (see
   Stacked PRs under Pull requests).
2. Create one correctly named branch for the work unit.
3. Make the scoped change, including docs/devlog/tests/assets that keep it
   complete.
4. Run the relevant verification plus the standard lint/build/test checks
   before PR; if any check cannot run, record the exact gap in the PR.
5. Commit one concern at a time with a body that says why.
6. Before opening a docs/chore PR (or at session end), grep the devlog
   for the open `## To promote` / deferred / needs-human queue and clear
   what the current scope covers, or explicitly re-defer; decided
   invariants shouldn't live only as devlog archaeology.
7. Push, open the PR with the template, and remove sections that do not apply.
8. Hand off per "Handing off the PR" (under Pull requests): start the
   review-watch, wait out required checks, handle reviewer activity,
   self-review the PR files view, and leave the PR open for a human to
   review and merge.

For changes on a **destructive path** (delete/cleanup), a
**credential-leak surface**, or a **returned-object-trust boundary**
(trusting fields of a value handed back by an external call or
deserializer), add a refute-first verification pass before committing
(independent lenses whose job is to _disprove_ the fix) and record in
the devlog which findings were confirmed, rejected-by-verification (so
they're not re-raised), and accepted-by-decision. For a
behavior-preserving refactor on one of these paths, where the platform
can execute code, have a lens reconstruct the
old implementation (`git show <base>:<file>`) and compare old against new
decision-for-decision over a fuzzed corpus; a diff-read can only assert
equivalence, a harness measures it. Scope all of this to those risk
classes; a docs typo or a refactor off these paths shouldn't trigger it.

<!-- /agents-md:managed:finish-line -->

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
  record in the devlog which findings were confirmed, rejected-by-verification,
  or accepted-by-decision. Scope this to those risk classes, not every change.
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
- **Drain devlog "to promote" notes before a docs/chore PR.** `grep` the
  devlog for the open `promote` / `deferred` / `needs human` queue and either
  promote what the PR's scope covers or explicitly re-defer; invariant notes
  must not pile up unpromoted (they did, across nine entries, before this
  cleanup). File maintainer-only actions as issues (`Refs #N`), not as devlog
  headings that the start-of-session read won't resurface.

<!-- agents-md:managed:branches -->

## Branches

All work lands through a PR: branch from `main` (read `main` as the
repo's default branch throughout), do the work as atomic commits (see
Commits), open a PR; the work merges with a real merge commit, a
human's call per the finish line. Never commit directly to `main`. No
triviality exception: every bypass erodes the `--first-parent`
narrative.

Name branches `<type>/<short-kebab-slug>`: type from the Conventional
Commits vocabulary (`feat`, `fix`, `refactor`, `docs`, `chore`), slug
2–4 kebab-case words naming the work unit:

```text
feat/worksheet-promotion
fix/pane-focus-race
chore/swift-format-sweep
```

Exactly one slash: refs are path-like, so `feat/x` and a branch named
just `feat` can't coexist. No ticket numbers, dates, or owner prefixes;
prepend an owner segment (`bnw/feat/…`) only if multiple people or
agents start pushing in parallel. Merged branches auto-delete where
that repo setting is on (delete them after merge where it isn't); the
merge commit carries the narrative.

**Prefer a dedicated worktree per work unit.** Where your platform and
session support working from a second checkout (a native worktree tool
or session flag, or plain
`git worktree add <path> -b <type>/<slug> <base>`), do the work in a
dedicated worktree instead of the shared primary checkout, so parallel
agent sessions and the user's own work never collide on files, branch
state, or uncommitted changes. Remove the worktree once its branch
merges (`git worktree remove <path>`). Where they don't (no
multi-checkout support, or a sandbox pinned to one directory), fall
back to a branch in the primary checkout; the branch discipline above
still applies either way.

Follow-up work that depends on an open PR can stack on its branch instead
of waiting; see the Stacked PRs pattern under Pull requests.

<!-- /agents-md:managed:branches -->

<!-- agents-md:managed:pull-requests -->

## Pull requests

A PR is one work unit, reviewed as a whole and merged with a real merge
commit. Commits carry the atomic why (see Commits); the PR carries the
arc.

- **Title**: imperative, ≤ 72 chars, names the outcome, no type prefix
  or ticket noise ("Fix missing menu bar on unbundled launch"). In the
  intended repo setup the PR title and body become the merge commit
  message, so `git log --first-parent` reads as the list of PR titles;
  write the title for that log either way.
- **Body**: scaffolded by the repo's PR template (on GitHub:
  `.github/pull_request_template.md`):
  - **Why**: prose, one to three short sentences. State the problem or
    motivation. Link the devlog entry when one exists; don't duplicate it.
    Where the template's comment spells out issue keywords, follow it
    exactly: a close keyword per issue the PR fully resolves, a plain
    `Refs #N` for related-but-unfinished issues that are left for a
    human to close.
  - **What**: required bullets. Describe work-unit outcomes, not
    file-by-file churn. For multi-commit PRs, use a compact commit map
    (one bullet per commit or concern), referencing each commit by its
    subject, not its SHA: folding a review fix into its commit (see
    Commits) rewrites every downstream SHA, so a SHA-keyed map forces a
    body rewrite each round, while subjects don't go stale. Say rejected
    alternatives live in the devlog when they do.
  - **Screenshots**: required for PRs with visible UI changes; delete it
    for non-visual work. Replace the section with actual forge-hosted,
    reviewer-visible image or recording attachments before handing off,
    and in every case before merge; local paths, textual descriptions,
    and "checked locally" notes do not satisfy it. If you cannot attach
    the artifacts yourself, say so at handoff and ask the user to add
    or confirm them before merge. Show the changed surfaces,
    important states, and every theme or appearance mode the change
    affects. Keep captions short and name the state shown. Verification
    still belongs in Verification.
  - **Review Notes**: optional bullets; delete the section when it adds
    no routing value. Use it to point reviewers at important files, review
    order, mechanical commits, or risky edges.
  - **Verification**: required bullets. Start each with `Passed:`,
    `Checked:`, `Attempted:`, or `Not run:`. Say what was actually run and
    observed: tests, lint, fixture/screenshot checks (every affected theme
    for UI), round-trips for schema changes. Facts only, never
    "should work"; verification gaps are explicit `Not run:` bullets.
    Factual doc claims ship under the same discipline: counts, flags,
    behaviors, and runtime guarantees are checked against the code and
    scoped to the surface they describe, stated without marketing or
    competitor put-downs.
- **Self-review the diff in the PR files view before handing off**: seeing
  the whole change as one artifact catches stray hunks, leftover debug code,
  scope creep, and accidental files the editor hid. This is a
  _mechanical-hygiene_ pass; it does **not** substitute for substantive
  critique.
- **Substantive critique needs fresh, ideally non-self eyes.** Same-context
  self-review shares the blind spots that produced the code. Independence
  ladder, weakest to strongest: self-in-context < same-model fresh-context
  subagent < different-vendor bot / human. An automatic bot reviewer or a
  human is the load-bearing substantive pass; the default finish line
  already stops at an open PR for one.
- **Optional, risk-gated: a fresh-context pre-push review.** For non-trivial
  changes, or any repo without an external bot reviewer, get fresh eyes
  before pushing. **Where your platform and tools support delegation** (and
  it is allowed without asking), spawn a fresh-context reviewer: prompt it
  to _refute_, give it only the diff plus the PR's stated intent (not your
  reasoning trail), and let it hunt correctness, security, and edge-case
  failures. **Where they don't** (no subagent concept, or delegation needs
  explicit permission), skip it and lean on the external bot / human review,
  or ask the user first; never emit steps the running agent can't perform.
  A same-model subagent is only _partially_ independent and costs tokens;
  scale to risk, skip trivial or mechanical work.
- **Record a noticed automated reviewer.** When you observe a bot-authored
  review on a recent PR, or a reviewer status signal (a bot reacting on PR
  descriptions shortly after they open, recurring across PRs: a reviewer
  whose passes have all been clean may never post a review), and the project
  hasn't recorded the reviewer, add a compact
  record (an "Automated reviewer" entry; the required fields below usually
  take a short paragraph) to an unmanaged, project-specific section of
  AGENTS.md
  (outside `agents-md:managed:*` blocks, so syncs don't overwrite it) with
  enough identity to match its future reviews: the reviewer's **name**, its
  **login/account identity** (including the API-specific form when it
  differs, e.g. a `[bot]` suffix in one API but not another), how it is
  **triggered** (automatic on PR events, a manual command, or a CI job), and
  any **status signals** it posts out of band (an in-progress or clean-pass
  indicator, e.g. a reaction on the PR description; some reviewers post no
  review at all on a clean pass, so the recorded clean-pass signal is what
  lets a later watch finish instead of timing out). Later sessions filter
  review activity by that login, so the identity, not a bare "a reviewer
  exists", is the point. An existing record is not a reason to skip: when
  you observe status signals (or a changed trigger) the record lacks,
  augment it in place, since a name/login/trigger-only record still forces
  the full wait cap on clean passes. Record only a reviewer and signals you
  actually observed, never an absence.
- **Responding to automated review.** Evaluate each comment on its merits:
  fix real findings; push back, _with a one-line reason_, on contrived,
  speculative, or already-fixed ones; never reflexively comply. Reply
  inline with the disposition and the fixing commit SHA ("Fixed in
  `<sha>`" / a reasoned decline), then resolve the thread. Resolving every
  thread is _not_ a hard merge gate; evaluate-on-merits is.
- **Fix the class, not just the cited line.** When a finding names one
  location, sweep the file and repo mechanically (grep for the finding's
  pattern, don't just eyeball nearby lines) and fix every instance in the
  same push: the class routinely recurs in sibling sentences or files the
  citation never named, and each miss costs another review round. For
  validation or parsing code, the mechanical sweep is an adversarial
  enumeration of the input space (case, spacing, indentation,
  prefix/suffix, order, duplication, nesting), run once as tests, not a
  widening of the cited pattern: pattern-widening spent eight review
  rounds on one class before the enumeration closed it.
- **Converge deliberately, and don't under-converge.** Automated
  reviewers can surface ever-smaller nits indefinitely, so converge
  and hand off rather than chasing every round to zero (value captured
  is the bar, not threads-at-zero). But don't declare a PR "addressed"
  while the reviewer is still raising real issues, and never treat a
  finding that recurs from your _own_ incomplete fix as convergence;
  that is a miss to sweep, not a stop. Bias toward continuing while
  findings are genuinely worthwhile; the human's merge is the reliable
  convergence signal, not your own sense that you are done.
- **Keep the body current as review evolves the PR.** The body becomes the
  merge commit, so when review adds commits or shifts scope, update What,
  the commit map (flag which commits resolve review findings, by subject as
  above), and Verification before re-handing-off. The inline disposition +
  fixing SHA on each resolved thread (above) is the located per-finding
  record (that reply is written once, post-fold, so its SHA doesn't churn);
  don't duplicate it into a standing "feedback" section that would drift.
- The intended repo settings enforce the Commits rules: merge commits
  only (squash and rebase disabled) and auto-delete of merged branches.
  Don't re-enable around them; where they aren't set, hold the same
  rules manually (merge-commit merges only, delete the remote branch
  after merge).

### Handing off the PR

An open PR, not a merged one, is the agent's finish line; leave it
open for a human to review, approve, and merge, unless the user
explicitly asks you to merge or the project has adopted a self-merge
workflow. Done means open, green, threads handled, self-reviewed, and
no new review activity outstanding. Once the PR is up:

- **Start one review-watch per PR/reviewer as soon as the PR is open**,
  where the project records an automated reviewer or you have observed
  one, before waiting on checks, so the checks wait can't defer it.
  Prefer a dedicated review-watch skill, tool, or automation that can
  report back without manual polling; otherwise, if
  your platform can watch non-blockingly (a backgrounded poll or scheduled
  wake-up) and policy permits that mechanism, use it; don't pause to ask
  whether to watch. If a non-blocking mechanism would need permission not
  already granted, take the next permitted path. Where non-blocking support
  is absent, use a bounded foreground poll when it fits the current turn;
  otherwise hand back with the baseline and don't silently skip the review.
- **Anchor the watch baseline to the event that should produce the next
  reviewer pass**, not the moment the watch starts: the PR open/ready or
  actual push event for open/push-triggered reviews; the request time for a
  no-push recheck (marking ready, manually requesting review). Reviewer
  activity after that event is in-scope and must be handled, never absorbed
  into the baseline as already-seen. On a new push, advance or replace the
  baseline rather than leaving duplicate watchers running.
- **Wait for required checks**: poll them until they complete (on
  GitHub: `gh pr checks <n>`); fix any red check on the branch, never
  hand off a known-red PR.
- **Self-review the diff** (above) so it's ready for a reviewer.
- **Close out the watch before handoff**: poll for _both_ new review
  comments and CI, address in-scope findings on the branch, or record the
  bounded timeout / no-review result with the baseline; only then declare
  done.
- **Stop and summarize**: say the PR is open and green, and surface
  anything the reviewer should focus on. Leave merging, branch cleanup, and
  the `main` resync to whoever approves it.

If the user does ask you to merge, merge with a real merge commit (on
GitHub: `gh pr merge <n> --merge`), delete the remote branch if the
auto-delete setting didn't, then resync
(`git checkout main && git pull --ff-only`), delete the local branch
(`git branch -d <branch>`), and `git fetch --prune`.

### Reviewing a PR

The mirror of "Responding to automated review": hold the bar you'd want
held for you. Use the project's review tooling for the bug-hunting
pass where it has any, otherwise read the full diff yourself; these
are the conventions for the comments the pass produces.

- **Calibrate to severity, and tag it.** Separate blocking findings
  (correctness, security, data-loss, red tests/CI, broken invariants) from
  non-blocking ones (naming, style, optional simplification). Only blockers
  gate the merge. Don't manufacture speculative or contrived findings; the
  author convention is to decline those with a one-line reason.
- **Every comment carries evidence and a concrete ask.** Point at
  `file:line`, name the failure it causes, and propose a fix or ask a
  question. Mark uncertainty as uncertainty ("possible:"), never assert it;
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
  fix-or-decline. Resolving every thread isn't the gate; agreement on
  blockers is.

### Stacked PRs

Dependent docs or cleanup work can proceed without waiting for its base: a
follow-up PR can be based on an open PR's branch (on GitHub:
`gh pr create --base <feature-branch>`, which auto-retargets to `main`
when the base merges; on other forges retarget it manually). Two
gotchas: while the base is open the stacked PR's diff shows only its
own commits; and if the base is force-pushed (the fold-review-fixes
rule in Commits), `rebase --onto` the stack onto the new base tip.

<!-- /agents-md:managed:pull-requests -->

<!-- agents-md:managed:commits -->

## Commits

History is optimized for three uses: diagnostics (blame/bisect lead to a
cause), reviewability (a PR reads commit-by-commit), and learning (the
log tells the project's evolution). Rules:

- **One concern per commit, every commit green.** If the body wants
  labeled sections (Correctness:/Performance:/…), it's more than one
  commit; split it. Each commit must build and pass tests on its own;
  never leave red intermediate states (it breaks bisect).
- **Body says why, not just what.** Write dense, specific bodies,
  wrapped ≤ 72 columns. Reference the session's devlog entry
  when one exists. State change deltas ("27 → 36 tests") if meaningful;
  never absolute status ("36 tests green"); CI asserts that, and it
  goes stale.
- **Never commit secrets** (credentials, tokens, keys, `.env`
  contents); reference them by name and use placeholders in examples.
- **Mechanical churn commits alone.** Reformats, renames, and moves get
  their own commit, added to `.git-blame-ignore-revs` in the same change
  (activate locally with
  `git config blame.ignoreRevsFile .git-blame-ignore-revs`).
- **Fold review fixes into the commit they belong to.** When a review
  comment or self-review turns up a fix for code in an already-pushed
  commit, fold it into that commit rather than appending an "address
  review" commit; the merged PR keeps its clean, bisectable structure.
  Guardrails: every commit still builds and passes tests after the fold;
  `--force-with-lease`, **feature branch only, never force-push `main`**;
  only while the PR is unmerged (once merged, a fix is a new commit);
  update the matching devlog entry in the same operation. The mechanism
  (reset/amend/rebase) is your judgement.
- **Never squash-merge multi-commit work**: it destroys the atomic
  structure above. Merge with a real merge commit so
  `git log --first-parent` reads as the work-unit narrative and the full
  log holds the atoms. Narrative subjects ("Walking skeleton: end-to-end
  flow") belong at that merge/PR level.

<!-- /agents-md:managed:commits -->

<!-- agents-md:managed:done -->

## Definition of done for an increment

Each increment is something actively used by the end of the work session:
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
