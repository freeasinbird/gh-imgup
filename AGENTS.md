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

`devlog/` holds the reasoning trail — one short append-only entry per
working session (see `devlog/README.md` for the protocol).

- **Before starting:** read the most recent one or two entries
  (`find devlog -maxdepth 1 -type f -name '*.md' ! -name README.md | sort | tail -2`)
  — they carry decisions and deliberate deferrals that aren't in the spec.
  Don't re-litigate or "fix" what an entry marks as decided/deferred without
  the user asking.
- **Before finishing:** append `devlog/YYYY-MM-DD-HHMM-slug.md` — decisions
  (why, and what was rejected), deferrals, open questions. Note anything
  that should be promoted to AGENTS.md — a new invariant discovered, a
  convention that wasn't written down, a gotcha that bit you. The devlog
  entry records it; a follow-up commit promotes it. Use local 24-hour
  time so same-day entries sort in session order. ≤ 40 lines; commits carry
  the what-changed.

<!-- /agents-md:managed:devlog -->

<!-- agents-md:managed:finish-line -->

## Default agent finish line

For any user request that asks you to change code, docs, assets, or project
state, the default endpoint is **an open, review-ready PR with required
checks green** — not a merged branch. Merging is a human decision; do not
merge your own PR unless the user explicitly asks, or the project has adopted
an opt-in self-merge workflow.

Use this checklist at the start of each work session:

1. Read README plus the latest devlog entries, then start from `main`.
2. Create one correctly named branch for the work unit.
3. Make the scoped change, including docs/devlog/tests/assets that keep it
   complete.
4. Run the relevant verification plus the standard lint/build/test checks
   before PR; if any check cannot run, record the exact gap in the PR.
5. Commit one concern at a time with a body that says why.
6. Push, open the PR with the template, and remove sections that do not apply.
7. Poll required checks until they finish; fix failures on the branch.
8. Self-review the PR files view, then hand off — leave the PR open for a
   human to review and merge.

Stop once the PR is open, green, and self-reviewed. Say what remains (review
and merge) and point the reviewer at anything that needs attention. Don't
merge, delete the branch, or resync `main` yourself unless the user asks for
that, or the project has adopted a self-merge workflow.

<!-- /agents-md:managed:finish-line -->

## Build, test, run

> **Status:** the toolchain below is the intended setup. As of this
> writing the repository holds only specs and conventions — `package.json`,
> `tsconfig.json`, `biome.json`, and `src/` do not exist yet. Creating them
> per these commands is the first implementation work unit. Update this
> note once the scaffolding lands.

- **Runtime:** Node.js 22+ (global `fetch`, `node:test`, type stripping).
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
| Test        | `npm test`         | `node --test` (Node built-in runner + `node:assert`)|
| Lint        | `npm run lint`     | `biome check .`                                    |
| Format      | `npm run format`   | `biome format --write .`                           |
| Run (local) | `node dist/index.js <file...> [options]` | or `npx gh-imgup …` once published |

- **CLAUDE.md is a pointer** that imports this file (`@AGENTS.md`). Edit
  AGENTS.md, never the pointer.
- **CI must run** `npm run build`, `npm test`, and `npm run lint` (plus
  `npm run typecheck`) on every PR. The workflow conventions below assume
  these checks exist and gate merges; add `.github/workflows/ci.yml` with
  the first implementation PR.

## Architecture invariants

These rules protect the project's security model — its entire reason for
existing over the alternatives. Each states what it prevents and how it's
enforced. Violating one is a security regression, not a style nit.

1. **GitHub API access is `fetch()`-only — no shell for GitHub ops.**
   Prevents shell injection structurally rather than defending with
   escaping. The tool makes exactly **two** subprocess calls ever —
   `execFileSync('gh', ['auth', 'token'])` and
   `execFileSync('git', ['remote', 'get-url', 'origin'])` — both with array
   args (no shell), no user input in the array, guarded by try/catch and a
   5s timeout. Adding a third subprocess call, or string-interpolating into
   either, breaks the invariant.

2. **Zero runtime dependencies.** Keeps the supply-chain audit surface to
   the tool itself plus Node built-ins. Enforced by `package.json` having
   an empty `dependencies` block; reviewers reject any runtime dep.

3. **The token never leaks.** Every API error path strips the token value
   from the message before it reaches stderr, CI logs, or agent context
   (`msg.replaceAll(token, '[REDACTED]')`). Any new error path that prints
   an API response must sanitize first.

4. **No third-party network destinations.** Requests go to exactly
   `api.github.com` and `uploads.github.com`. There is no fallback host;
   missing/invalid credentials fail loudly. Never add an alternative upload
   destination.

5. **Strict MIME allowlist, no inference.** Only `.png/.jpg/.jpeg/.gif/.webp`
   map to fixed MIME types. No content sniffing, no `application/octet-stream`
   fallback. SVG is excluded (active-content format); if ever added it goes
   behind an explicit `--allow-svg` flag with a warning.

6. **Upload integrity is verified.** Compare local SHA-256 against the API
   `digest`; on mismatch, delete the asset and fail. If the server omits a
   digest, warn on stderr (don't silently pass).

7. **Output contract: stdout is machine-parseable only.** Markdown, raw
   URL, or JSON to stdout; all progress, warnings, and errors to stderr.
   Exit 0 only when every upload succeeded. Don't print human chatter to
   stdout.

## Conventions & gotchas

- **Prerelease, never draft.** The `_gh-imgup` release must be a
  prerelease — draft releases can't be resolved by tag, so asset
  `browser_download_url`s 404. This is load-bearing, not a preference.
- **Release tags must start with `_`.** `validateTag` rejects anything
  else, preventing `--tag v2.0.0` from polluting real releases. Default is
  `_gh-imgup`.
- **Create-or-get is race-safe.** Two concurrent runs both see 404 and try
  to create; one gets 422. On 422 (tag exists), retry the GET; on 422 for
  any other reason, fail with the original error.
- **`--cleanup` is always interactive — no `--yes`.** The reference scan
  covers issue/PR bodies and comments only (not wiki, README, or other
  files), so it can't guarantee completeness; a human must confirm. Full
  release deletion is intentionally left to manual `gh release delete`.
- **Three distribution channels, one codebase.** npm package, `gh`
  extension wrapper (root `gh-imgup` shell script), and `skills/gh-imgup/SKILL.md`
  all point at the same compiled `dist/`. Keep them in sync.
- **The SKILL.md pre-upload image review is a security control**, not
  documentation filler — it's the highest-impact mitigation in the system
  (the upload is secure; the risk is what gets uploaded). Don't weaken it.

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
- **Self-review the diff in the PR files view before handing off** — it
  catches stray hunks and leftovers the editor view didn't.
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
- **Stop and summarize** — say the PR is open and green, and surface
  anything the reviewer should focus on. Leave merging, branch cleanup, and
  the `main` resync to whoever approves it.

If the user does ask you to merge, use `gh pr merge <n> --merge` (the only
enabled method; the remote branch auto-deletes), then resync
(`git checkout main && git pull --ff-only`), delete the local branch
(`git branch -d <branch>`), and `git fetch --prune`. A stacked follow-up PR
retargets to `main` on its own once its base merges.

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
