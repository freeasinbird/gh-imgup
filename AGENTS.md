# AGENTS.md

`gh-imgup` is a zero-dependency TypeScript CLI for attaching images to GitHub
issues and PRs through the documented Release Assets API, especially UI
screenshots from agents and CI. [README.md](README.md) holds the specification;
`docs/` holds the design history. This file is the source of truth for
development conventions and security invariants, for contributors and agents.

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
  dependency updates, mechanical syncs, large mechanical changes such as
  renames, and simple fixes need no note unless they reveal a lasting
  decision or discovery.
- **Find notes from the work first.** Read notes linked from the current issue
  or PR. Otherwise, search by path, topic, contract, or decision name. Read
  the latest note only when resuming the work unit it describes.
- **Treat old notes as evidence, not rules.** Do not silently overturn an
  explicit owner decision. When new evidence conflicts with one, name the old
  decision, explain which assumption or condition changed, and propose the
  revision.

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
3. Make the scoped change. For a visible UI change, capture the current state
   before you change it. Include the docs, tests, and assets needed to keep
   the change complete. Add a decision note only when its triggers apply.
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

- **Runtime:** Node.js 22+ (`fetch`, `node:test`); CI uses Node 22 and 24.
  Builds and tests also run on Node 20 locally because tests use compiled JS.
- **Package manager:** npm. Distribution channels are listed under Conventions;
  invariant 2 forbids runtime dependencies.

Commands (runnable in CI):

| Task | Command | Notes |
| --- | --- | --- |
| Build | `npm run build` | `tsc`: `src/*.ts` → `dist/` |
| Type-check | `npm run typecheck` | `tsc --noEmit` |
| Test | `npm test` | Builds, then `node --test dist/*.test.js` with `node:assert` |
| Lint | `npm run lint` | `biome check .` |
| Format | `npm run format` | `biome format --write .` |
| Run (local) | `node dist/index.js <file...> [options]` | Published: `npx -y @freeasinbird/gh-imgup …` |

- **CLAUDE.md is a pointer** that imports this file (`@AGENTS.md`). Edit
  AGENTS.md, never the pointer.
- **Keep CI green and required.** `.github/workflows/ci.yml` runs lint,
  typecheck, and tests (including build) on Node 22/24 for every PR and push
  to `main`. Branch protection requires `check`, including for admins;
  nobody pushes directly to `main`.
- **Preserve the fail-closed `check` job:** its name, `if: always()`, and
  explicit `needs.test.result == "success"` test. A plain `needs:` job skips
  when a matrix leg fails, which GitHub treats as satisfying the required
  check. Renaming it leaves the required context missing.
- **Deferred checks:** revisit a macOS/Windows matrix after a platform-specific
  bug, and a coverage-threshold gate when baseline coverage numbers exist.

## Releases

Published as `@freeasinbird/gh-imgup`. See Versioning under Conventions & gotchas.

- **Publishing is OIDC Trusted Publishing: no `NPM_TOKEN`.**
  `.github/workflows/release.yml` publishes on `vX.Y.Z` tags with
  `id-token: write` and npm ≥ 11.5.1 (required for OIDC). Provenance is automatic;
  omit `--provenance`. npmjs.com's trusted publisher uses this repo,
  `release.yml`, a blank environment, and allowed action `npm publish`.
- **Keep `publishConfig.access: "public"` in `package.json`.** Scoped packages
  default to private. Keep `prepack` building `dist/` and `prepublishOnly`
  gating publication; see the packaging convention below.

To cut a release:

1. **Bump both manifests in a PR.** Keep `package-lock.json`'s root and
   `packages[""]` name/version equal to `package.json` (`@freeasinbird/gh-imgup`
   and the new version). `npm version` updates both; stage the lockfile
   explicitly. Drift breaks `npm ci`.
2. **Update the two runnable README pins:** `npm i -g
   @freeasinbird/gh-imgup@X.Y.Z` and the CI `npx -y
   @freeasinbird/gh-imgup@X.Y.Z` example. Find them with
   `grep -n 'gh-imgup@0' README.md`. Leave ellipsized `…@0.1.0` allowlist
   illustrations unchanged; they illustrate matching, not the current version.
3. **Push the matching `vX.Y.Z` tag.** `release.yml` publishes, skipping versions
   already on npm, so repeating the publish step is a no-op.
4. **Create a normal, notes-only GitHub release after pushing the tag:**
   `gh release create vX.Y.Z --verify-tag --title vX.Y.Z --notes "<short prose
   summary of the CHANGELOG entry>"`. Tag-triggered npm publication does not
   create the GitHub release. Do not mark it prerelease or attach assets; see
   the extension restriction under Conventions.

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

10. **User-controlled text interpolated into Markdown for a GitHub-rendered
    surface must be escaped, never pasted in raw.** Uploaded filename stems use
    `escapeAltText` (`src/markdown.ts`), which backslash-escapes `\ [ ]` in
    image alt text and collapses controls via `collapseControls`, so a crafted
    filename cannot close `![…]` and inject a second image. The `-m/--message`
    caption is plain text: `escapeMarkdownText` (also in `src/markdown.ts`)
    collapses controls and backslash-escapes every ASCII punctuation character
    before `src/index.ts` composes the comment, preventing active Markdown links
    or images and raw HTML. Asset URLs use `markdownDestination`
    (`src/output.ts`), which angle-wraps a URL containing whitespace or `()`.
    The default Markdown stdout output and the `--json` output's `markdown`
    field share the `markdownLine` chokepoint in `src/output.ts`; `--raw` emits
    a bare URL and needs no Markdown escaping. Any future field must use an
    escaper for its specific Markdown context before composition.

## Conventions & gotchas

- **Expect no automated reviewer.** This project has the following reviewer
  record:

  - **Reviewer:** `none`, an owner decision. Only the owner changes it.

  The owner turned off automatic ChatGPT Codex PR reviews on 2026-10-21.
  Don't wait for a Codex review, don't post `@codex review`, and don't
  record Codex as this project's reviewer from the
  `chatgpt-codex-connector[bot]` reviews on earlier PRs. With no bot
  reviewer, `docs/agent-workflow.md` §pre-push-review applies to every PR,
  not only risky ones. A review-watch skill such as `await-pr-review` skips
  the review exchange and waits on CI checks only; the handoff says the
  record skipped the watch. If a reviewer is turned on again, the owner
  replaces this record with one from an observed review and updates the
  landing record's Reviewer fields to match. Per-finding response
  conventions live under Pull requests.
- **Use `freeasinbird/gh-imgup` on GitHub for forge calls.** This project
  has the following forge record:

  - **Host:** `github.com`.
  - **Slug:** `freeasinbird/gh-imgup`. Pass `--repo freeasinbird/gh-imgup`
    to `gh`; never derive the owner from a sibling project.
  - **Consumers:** `await-pr-review`, `land-approved-prs`, `merge-cleanup`,
    and `visual-evidence` read this record before inferring a repository
    from a remote.
- **Land approved PRs by label.** This project has the following landing
  record:

  - **Mechanism:** `label`.
  - **Approval:** `approved`, added by a collaborator with the Approver
    permission; agents never add it.
  - **Hand-back:** `needs-human`.
  - **Approver permission:** `write`.
  - **Stale lock age:** `240` minutes.
  - **Base-advance checks:** none.
  - **Reviewer:** `none`.
  - **Consumer:** `land-approved-prs`.
- **Versioning: `0.x` until the contract is deliberately frozen at `1.0.0`.**
  CLI and machine-output contracts are stable by intent while usage accrues;
  `0.x` defers the formal semver promise. Freezing at `1.0.0` requires a deliberate
  human decision once usage justifies it. Do not bump to `1.0` or assume a minor
  release permits breaking the contract without that decision. See issue #16.
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
  `npx -y @freeasinbird/gh-imgup …` is canonical. `-y` prevents a first-run
  prompt from hanging agents/CI; the scope avoids the different `npx gh-imgup`
  package. Recommend pinned, pre-installed `gh-imgup` for repeat use and strict
  approval reviewers: `-y` bypasses only npx's prompt, not approval gates.
  Keep README/SKILL/AGENTS invocations and allowlist strings aligned:
  Claude Code `Bash(gh-imgup *)` (pinned) or
  `Bash(npx -y @freeasinbird/gh-imgup *)` (the space before `*` excludes pinned
  `…@0.1.0`); Codex `["gh-imgup"]` (it won't auto-run npx).
  In Claude auto mode, narrow allow rules resolve before the safety classifier.
  The pinned rule suffices; npx was denied in testing despite its allow rule,
  and env-prefixed commands match no rule. Those need user-added
  `autoMode.allow`: testing blocked agent edits in auto mode, and checked-in
  `.claude/settings.json` cannot carry it. Before configuring approvals or
  editing this guidance, read README's "Pre-authorize for agents" for the
  snippets and constraints. Revisit when another host needs an equivalent path.
- **Keep the gh extension source-installed:** clone the repo and run the root
  `gh-imgup` script. Never attach any asset ending in a recognized `<os>-<arch>`
  suffix (`*-darwin-amd64`, `*-linux-amd64`, `*-windows-amd64.exe`, …), including
  helper files, regardless of prefix. `gh` matches every asset by suffix and
  switches to binary installation. Normal versioned releases and automatic
  source archives are safe. Ship no precompiled binaries: bundled Node runtimes
  undercut the zero-runtime-dependency model. A binary switch needs separate
  review; see issue #14 and
  [the research note](devlog/2026-06-26-1212-gh-extension-release-asset-rule.md).
- **`dist/` is gitignored, so packaging builds it at pack time.** The `prepack`
  hook must build `dist/index.js`, the npm `bin` target, or a clean pack/publish
  ships a broken install. Keep `prepack` and the `files` exclusion for
  `dist/**/*.test.js`: compiled tests must not ship. Verify with
  `npm pack --dry-run --json`.
- **Keep SKILL.md's pre-upload image review.** It is a security control against
  uploading sensitive content; a secure upload does not make the image safe.
  Do not weaken it.
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
  (counts, flags, behavior, subprocess/network guarantees) must match `src/`
  and distinguish the compiled CLI from the shell wrapper. State facts plainly;
  avoid marketing and unverifiable claims about other tools.
- **Authoring control-char / escape regexes through the edit tooling is
  unreliable.** A character class with control chars, `\uXXXX` escapes, or a
  `\x00-\x7f` range can have its escapes decoded into literal bytes (or the
  range mangled) by the editor/JSON layer. Write such regexes via a node
  script (or use `codePointAt` scans instead of escape ranges) and byte-audit.
- **npm scripts must be cross-platform.** npm uses `cmd.exe` on Windows. Use
  Node one-liners, like the `clean` script's
  `node -e "require('node:fs').rmSync(...)"`, instead of Unix commands (`rm`,
  `cp`, `test`), so tests and packaging also run on Windows.
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
- **Use the PR template for the body.** Include Why, Scope, What,
  Departures, Screenshots for UI changes, optional Review Notes, and
  Verification. Departures is required; write "None" when nothing departs.
  Key any commit map by subject, not SHA. Start verification bullets with
  `Passed:`, `Checked:`, `Attempted:`, or `Not run:`. Before writing or
  updating the body, read `docs/agent-workflow.md` §pr-body. For a UI change,
  meet its Screenshots requirements.
- **Self-review the full diff in the PR files view.** Look for stray changes,
  debug code, scope creep, and accidental files. This catches accidental
  changes; it doesn't check whether the solution is correct.
- **Repeat integration checks when the base moves.** Before merge, follow
  `docs/agent-workflow.md` §handing-off step 3. A landing check reruns CI,
  not review; a refresh you push restarts the review watch.
- **Use fresh eyes for substantive review.** Reviewing your own work in the
  same conversation shares the author's blind spots. A review in a fresh
  conversation is more independent. A bot from another provider or a human is
  stronger. Rely on a bot or human before handoff. Before pushing risky work,
  or any work without a bot reviewer, read `docs/agent-workflow.md`
  §pre-push-review. Risk means a destructive path, a credential-leak
  surface, a returned-object trust boundary, a contract change, or untested
  behavior.
- **Record an automated reviewer you observe.** If the project has no record
  for that reviewer or signal, and its reviewer record isn't `none`, read
  `docs/agent-workflow.md` §reviewer-record and update the project record
  before handoff.
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
  yourself; the reviewer's label is only evidence. When a reachable defect's
  severity is unsure, treat it as blocking. When its reachability is unsure,
  trace the callers or run the case before patching.
- **Raise the bar as rounds continue.** After the early rounds, when a finding
  recurs, or when findings cite code an earlier round added, read
  `docs/agent-workflow.md` §review-convergence before deciding on another
  round. Before handoff, mark every finding fixed, declined, deferred, or
  explicitly outstanding.
- **Keep the PR body current.** When review adds commits or changes scope,
  update Scope, What, Departures, and Verification, and any commit map. Keep
  each finding's outcome in its inline reply, not a permanent feedback
  section. Once images are hosted, start a later body edit from the live body.
- **Keep the intended repository rules.** Use merge commits only, disable
  squash and rebase merges, use title-only merge messages, and auto-delete
  merged branches. Do not re-enable a disabled method. Enforce these rules
  manually where repository settings don't.

### Handing Off the PR

A PR is ready to hand off when it's open, green, self-reviewed, has no
unhandled threads, and has no outstanding review activity. After opening the
PR, read `docs/agent-workflow.md` §handing-off and follow its sequence.
End with the report its step 7 defines.

Once the approver approves a PR to land, stop pushing to it unless you are the
landing batch. Turn off any auto-fix, CI repair, or review watch the platform
runs for it, where the platform offers that control; otherwise tell the
approver which automation still runs.

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
