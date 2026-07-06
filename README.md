# gh-imgup

[![npm](https://img.shields.io/npm/v/@freeasinbird/gh-imgup)](https://www.npmjs.com/package/@freeasinbird/gh-imgup)
[![CI](https://github.com/freeasinbird/gh-imgup/actions/workflows/ci.yml/badge.svg)](https://github.com/freeasinbird/gh-imgup/actions/workflows/ci.yml)

A CLI tool that uploads images to GitHub issues and pull requests using the documented Release Assets API. Designed for agents and CI workflows that need to attach screenshots (particularly before/after UI images) to PRs for human reviewers.

---

## Quick Start

```bash
# Upload an image and get Markdown to drop into a PR/issue body
npx -y @freeasinbird/gh-imgup screenshot.png --repo owner/repo
# → ![screenshot](https://github.com/owner/repo/releases/download/_gh-imgup/screenshot-a1b2c3d4.png)

# Or post it straight to a PR (or issue) as a comment
npx -y @freeasinbird/gh-imgup screenshot.png --repo owner/repo --pr 42 -m "Login screen"
```

Needs a `GITHUB_TOKEN` with `contents:write` (add `issues:write` for `--pr`/`--issue`), or a logged-in `gh` CLI. Run it inside the target repo and `--repo` is inferred from the git remote.

**Using an agent (Claude Code, Cursor, Codex)?** Also add the [skill](#agent-skill-claude-code-cursor-codex): `npx -y skills add freeasinbird/gh-imgup` gives the agent the usage guidance and the mandatory pre-upload image review. It does **not** install the CLI; the agent still runs `gh-imgup` from one of the options in [Installation](#installation). For the smoothest agent runs, pre-install a pinned version (`npm i -g @freeasinbird/gh-imgup@X.Y.Z`) and pre-authorize the bare `gh-imgup`; see [Pre-authorize for agents](#pre-authorize-for-agents), which covers both Claude and Codex.

---

## Why This Exists

GitHub has no public API for image attachments. The drag-and-drop upload in the web UI uses an internal endpoint that requires browser session cookies and has been explicitly denied as a public API for over five years ([cli/cli#1895](https://github.com/cli/cli/issues/1895)).

That's a real gap for automated workflows. When an agent or CI job implements a UI change, the most useful artifact for review is a screenshot: a CSS diff doesn't tell a reviewer whether a layout looks correct, but a before/after pair answers that in seconds. Without a programmatic path, PRs describe visual changes in text and leave reviewers to check out the branch and see for themselves. Capturing those screenshots by hand is enough friction that it often gets skipped.

`gh-imgup` uploads through the documented Release Assets API to the **same repository** the PR or issue lives in, so the repo's existing access controls apply to the images. It automates the upload-and-link step; the only manual part left is capturing the screenshots, which an agent with browser access can also do. (The alternatives considered and the security rationale are in the [Security Model](#security-model) and [`docs/design.md`](docs/design.md).)

### Other use cases

- Visual regression evidence in a PR description or comment
- Error screenshots in bug reports
- Test result images (charts, rendered components) in issues
- Architecture diagrams or design mockups embedded in discussions
- Any image a human reviewer would benefit from seeing alongside code

---

## Installation

### npm

While you can run `gh-imgup` zero-install with `npx -y @freeasinbird/gh-imgup …`, for repeated use (or for any agent whose approval reviewer refuses to run unpinned downloaded code, such as Codex; see [Pre-authorize for agents](#pre-authorize-for-agents)) install a **pinned** version once and invoke the bare `gh-imgup`:

```bash
npm i -g @freeasinbird/gh-imgup@0.1.3   # pin the current version; `npm view @freeasinbird/gh-imgup version`
gh-imgup screenshot.png --repo owner/repo
```

Pin a version in CI the same way, e.g. `npx -y @freeasinbird/gh-imgup@0.1.3 …`. When you run it from a different repo's checkout (e.g. the gh-imgup source) rather than your project's, pass `--repo owner/repo`; otherwise it infers the repo from that checkout's git remote.

For the npx form, keep the `-y` (it skips npx's first-run prompt, which would otherwise hang a non-interactive agent or CI job) and the `@freeasinbird/` scope (a bare `npx gh-imgup` is a different, unscoped package).

### `gh` CLI extension

```bash
gh extension install freeasinbird/gh-imgup
gh imgup screenshot.png
```

The extension is compiled from source, so on first run it prints a one-time build command (`npm ci --include=dev && npm run build` in the extension directory). Run it once. This is the only step that touches the npm registry; afterward the tool contacts GitHub only and works offline, and later upgrades rebuild automatically.

### Agent skill (Claude Code, Cursor, Codex)

The skill definition lives at [`skills/gh-imgup/SKILL.md`](skills/gh-imgup/SKILL.md). Install it with the [`skills` CLI](https://github.com/vercel-labs/skills):

```bash
npx -y skills add freeasinbird/gh-imgup   # install
npx -y skills update                       # update installed skills to the latest
```

`skills add` reads the repository's default branch, so it works once the skill is merged there. You can also copy `SKILL.md` into your agent's skills directory by hand. Either way, the agent picks up the tool and its mandatory pre-upload image-review step together.

### Pre-authorize for agents

To let an agent reach for the tool without a per-run approval prompt, pick one of two forms and allowlist that exact string:

- **Zero-install:** `npx -y @freeasinbird/gh-imgup …`. Convenient, but every run re-downloads and executes freshly-resolved package code. Some agents' approval reviewers (Codex) refuse to auto-approve that, `-y` or not (see below).
- **Pinned pre-installed (recommended for repeat use / strict reviewers):** install once (`npm i -g @freeasinbird/gh-imgup@X.Y.Z`) and allowlist the bare `gh-imgup`. Auditable once, no per-run download, and it passes stricter reviewers.

**Claude Code.** Add a permission allow rule; in auto mode, some invocations additionally need a classifier exception. A skill can't self-authorize either one.

1. **A permission allow rule** removes the approval prompt, and a narrow rule like `Bash(gh-imgup *)` also carries over into auto mode, resolving before its safety classifier: the pinned flow needs nothing else. In `~/.claude/settings.json`, or a repo's checked-in `.claude/settings.json` to share it with a team:

   ```json
   {
     "permissions": {
       "allow": ["Bash(gh-imgup *)"]
     }
   }
   ```

   For the zero-install form use `"Bash(npx -y @freeasinbird/gh-imgup *)"` instead (plus `"Bash(npx -y @freeasinbird/gh-imgup@*)"` if you pin in CI). Bless only the form you actually run, never a blanket `Bash(npx *)` (it would auto-approve any package). Rules match by command prefix, so `GITHUB_TOKEN=$(gh auth token) gh-imgup …` won't match (and an `export` doesn't persist between an agent's shell calls). Run the command bare instead: with `GITHUB_TOKEN` unset, gh-imgup resolves the `gh` CLI token itself. Choosing **"Yes, and don't ask again…"** at the first prompt writes the rule for you.

2. **If auto mode's safety classifier still denies the run**, add an `autoMode.allow` entry. The classifier adjudicates what no narrow allow rule resolves ([auto mode configuration](https://code.claude.com/docs/en/auto-mode-config.md)), and it flags gh-imgup as external npm code holding a live token: in our testing it denied the zero-install form even with the matching npx allow rule in place (the docs don't classify package-runner rules), and it gates every command when `autoMode.classifyAllShell` is enabled. The entry goes in `~/.claude/settings.json` or `.claude/settings.local.json` (the classifier ignores a repo's checked-in `.claude/settings.json`); describe the form you run, e.g. for zero-install:

   ```json
   {
     "autoMode": {
       "allow": [
         "$defaults",
         "Running the gh-imgup screenshot uploader (npx -y @freeasinbird/gh-imgup), including passing it a GitHub token via GITHUB_TOKEN or $(gh auth token). This is a sanctioned tool for attaching screenshots to my PRs/issues; treat it as trusted with repo write scope."
       ]
     }
   }
   ```

   Keep the literal `"$defaults"` (without it the entry replaces the built-in rules), and bless only the form you run: for the pinned install, describe the locally-installed `gh-imgup` binary instead. Add the entry yourself, or have the agent add it with auto mode briefly off; in our testing the classifier blocked the agent from writing it in auto mode.

With no settings change at all, run the upload yourself from the input box: `! GITHUB_TOKEN=$(gh auth token) gh-imgup shot.png --repo owner/repo --raw`.

**Codex** doesn't read Claude settings, and its approval reviewer won't auto-run `npx` (it sees unpinned downloaded code with credential access). Use the pinned form:

1. **Pin:** `npm view @freeasinbird/gh-imgup version`.
2. **Install trusted:** `npm i -g @freeasinbird/gh-imgup@X.Y.Z`.
3. **Approve a narrow persistent prefix** for the installed command: `["gh-imgup"]`. Choose Codex's persistent "always allow" when prompted.

Don't blanket-allow `npx`, `npm exec --package`, or the unpinned scope: that grants whatever those resolve to next full access to your files and GitHub credentials. On **Codex Cloud**, put the install line in the environment setup script and allow the `api.github.com` and `uploads.github.com` domains.

---

## Usage

```
gh-imgup <file...> [options]

Options:
  --repo <owner/repo>   Target repository (default: inferred from git remote)
  --pr <number>         Comment on a pull request
  --issue <number>      Comment on an issue
  -m, --message <text>  Caption to include in a posted comment
  --json                JSON output to stdout
  --raw                 Raw URL(s) only
  --tag <name>          Release tag (default: _gh-imgup, must start with _)
  --max-size <MB>       Max file size in MB (default: 25)
  --cleanup             Interactively delete unreferenced assets
  -h, --help            Show help
  -v, --version         Show version

Environment:
  GITHUB_TOKEN          GitHub token with contents:write scope (add issues:write
                        for --pr/--issue). Optional: if unset, falls back to the
                        gh CLI token (gh auth token), warning on stderr that its
                        scope is broader. In GitHub Actions it is provided
                        automatically (add a permissions block).
```

### The agent workflow

An agent with headless browser access (Playwright MCP, Chrome DevTools MCP, or shell access to run a script) can automate the full cycle:

```
1. Check out main, start dev server, screenshot the component    → before.png
2. Check out PR branch, restart, screenshot the same component   → after.png
3. gh-imgup before.png after.png                                → Markdown links
4. Put those Markdown links in the PR description or issue body
```

The reviewer opens the PR and sees the images inline in the body, before any follow-up discussion: no branch checkout, no local dev server, no context switching. Capturing the screenshots and composing the PR/issue body are the agent's responsibility; this tool handles only upload and Markdown output (see [Output](#output) below for composing bodies and posting comments).

### Output

Stdout receives only machine-parseable output. Stderr receives progress, warnings, and errors.

```bash
# Default: markdown image reference, suitable for a PR/issue body
$ gh-imgup screenshot.png
![screenshot](https://github.com/owner/repo/releases/download/_gh-imgup/screenshot-a1b2c3d4.png)

# JSON: always an array (one object per file), for piping into other tools
$ gh-imgup screenshot.png --json
[{"url":"https://...","markdown":"![screenshot](...)","filename":"screenshot.png","repo":"owner/repo","digest":"sha256:abc123..."}]

# Multiple images for body composition
$ gh-imgup before.png after.png
![before](https://github.com/.../before-e5f6a7b8.png)
![after](https://github.com/.../after-c9d0e1f2.png)
```

For an agent creating or editing a PR/issue body, compose the stdout Markdown into that body:

```bash
{
  printf '## Screenshots\n\n'
  gh-imgup before.png after.png --repo owner/repo
} > pr-body.md && gh pr create --body-file pr-body.md
```

For an already-open thread where a follow-up comment is desired, use comment mode:

```bash
gh-imgup before.png after.png --pr 42 -m "Button component: visual diff"
```

### GitHub Actions Example

```yaml
name: Visual Diff
on: pull_request

permissions:
  contents: write
  issues: write

jobs:
  screenshot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: npm ci

      - name: Capture screenshots
        run: |
          npx playwright screenshot http://localhost:3000/component before.png
          # ... (build PR branch, screenshot again as after.png)

      - name: Upload to PR comment
        run: npx -y @freeasinbird/gh-imgup before.png after.png --pr ${{ github.event.pull_request.number }} -m "Visual diff"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

This example uses comment mode because the PR already exists by the time a `pull_request` workflow runs. Agents creating or editing the PR body should use the stdout-composition flow above instead.

---

## How This Works

### Upload mechanism

Images are uploaded as Release Assets on the same repository where the PR or issue lives, under a prerelease tagged `_gh-imgup`. The GitHub REST API returns a `browser_download_url` that renders in any GitHub markdown context: issue bodies, PR descriptions, comments.

```
https://github.com/{owner}/{repo}/releases/download/_gh-imgup/{filename}
```

On private repos, this URL is only accessible to users with repo access. The access model is inherited automatically, with no separate hosting configuration needed.

### Authentication

The tool uses `GITHUB_TOKEN`, the standard mechanism for GitHub API access: provided automatically in GitHub Actions, or locally a fine-grained PAT scoped to a single repository or the token stored by the `gh` CLI. Required scopes: `contents:write` for uploading, plus `issues:write` if commenting on a PR or issue.

The token is read from the environment (or the `gh` CLI), held in memory, sent only to `api.github.com` / `uploads.github.com` over HTTPS, and never written to disk; error output is sanitized to strip token values. See the [Security Model](#security-model) for the full boundary.

### Upload flow

1. **Ensure the `_gh-imgup` prerelease exists** on the target repo (create if missing, with a race-condition-safe create-or-get pattern)
2. **Validate the file**: check existence, size (via `stat()` before reading), and the extension against a strict allowlist (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`), each mapped to a fixed MIME type (SVG is excluded as an active-content format)
3. **Upload** as a release asset via `POST https://uploads.github.com/...` with a collision-safe filename (`{stem}-{8-char-hex}.{ext}`)
4. **Verify integrity**: compare local SHA-256 against the API response digest; delete and fail on mismatch
5. **Return Markdown** on stdout for the caller to embed; optionally, with `--pr` / `--issue`, post the Markdown as a comment via the Issues API

All GitHub interaction uses `fetch()`. The compiled CLI makes exactly two subprocess calls ever (`gh auth token` for fallback auth and `git remote get-url origin` for repo inference), both via `execFileSync` with array arguments (no shell, no string interpolation, no user input in the array). (The `gh`-extension wrapper is a thin bootstrap shell script that builds/locates `dist/` and forwards arguments to `node`.)

---

## Security Model

These choices came out of a security review of the problem and of existing tools; the full write-up is in [`docs/design.md`](docs/design.md).

### What the tool does

- Reads image files from local disk
- Sends them to `api.github.com` and `uploads.github.com` (GitHub-owned, documented API)
- Optionally comments on a PR or issue
- Outputs URLs/markdown to stdout

### What the tool does not do

- Read, decrypt, or access browser cookies or sessions
- Open or automate a browser
- Contact any third-party services (no fallbacks, no analytics, no telemetry)
- Store credentials (token is read from env, used in-memory, never written to disk)
- Execute shell commands with user-provided input

### Credential scope

With a fine-grained PAT scoped to `contents:write` + `issues:write` on one repo:

**Can:** create prereleases, upload assets, and comment on issues/PRs (that repo only).

**Cannot:** access other repos, change account settings, manage SSH keys, read private repos not in scope.

**Honest limitation:** `contents:write` also permits pushing commits; there is no `releases:write`-only scope in GitHub's current permission model. Use a short-lived, single-repo fine-grained PAT to minimize blast radius.

### Agent image safety

In agentic workflows, the agent decides what to screenshot. The SKILL.md includes a mandatory pre-upload review instruction: examine every image for API keys, tokens, secrets, internal URLs, PII, or other sensitive content before uploading, and refuse the upload if any are found. This is the highest-impact security control in the system: the upload mechanism is secure, so the risk is in what gets uploaded.

### Tradeoffs

These are inherent to the Release Assets approach, accepted with open documentation rather than hidden.

- **Images are browsable on public repos.** Anyone can visit `https://github.com/{owner}/{repo}/releases/tag/_gh-imgup` and see every uploaded image. That is worse than GitHub's native `user-attachments/assets/{uuid}` model, which has no public index. On private repos this is a non-issue (only users with repo access can see the releases page). Draft releases would remove the public index but break image rendering (GitHub 404s when resolving draft releases by tag), so a prerelease is the only viable option.
- **`contents:write` is broader than ideal** (see Credential scope above): the same token that uploads images could push code. Use a fine-grained PAT with the shortest practical expiration, scoped to one repository.
- **Images persist until deleted.** Release assets don't auto-expire. `gh-imgup --cleanup` interactively removes unreferenced assets (scanning issue/PR bodies and comments); full release deletion is a manual `gh release delete`, intentionally not automated because it breaks every previously-embedded image. The prerelease is labeled `⚠️ Image assets — do not delete` with a description explaining the consequences.
- **Not the same URL format as drag-and-drop.** GitHub's web UI produces `user-attachments/assets/{uuid}` URLs; this tool produces `releases/download/_gh-imgup/{filename}` URLs. Both render identically in GitHub markdown. The only functional difference: `user-attachments` are GitHub-managed and eventually cleaned up, while release assets persist until explicitly deleted.

---

## Versioning

`gh-imgup` is **0.x** while real-world usage accrues: the CLI flags and the machine-output contract (`--json` / `--raw` / exit codes) are stable by intent, but `0.x` means they are not yet a frozen semver promise. `1.0.0` will freeze them, cut once usage justifies committing to that guarantee.

---

## Design Process

This tool was designed through adversarial security iteration: three existing tools were audited to map the problem space, the proposed solution went through two more rounds of security audit with all findings addressed, and the architecture was refined on each pass. The full spec and the rationale behind each decision live in [`docs/design.md`](docs/design.md).

---

## Repo Layout

```
gh-imgup/
├── src/
│   ├── index.ts          # CLI arg parsing, orchestration
│   ├── auth.ts           # Token resolution, scope warnings, error sanitization
│   ├── apierr.ts         # API error formatting + token-decode redaction
│   ├── release.ts        # Create-or-get release, upload asset, verify digest
│   ├── github.ts         # Comment on PR/issue
│   ├── validate.ts       # Repo, tag, number, file, MIME, remote URL parsing
│   ├── cleanup.ts        # Scan issues/PRs for references, interactive deletion
│   ├── markdown.ts       # Rendered-inline Markdown decode + alt-text escaping
│   └── upload.ts         # Types, MIME allowlist, output formatters
├── dist/                 # Compiled JS
├── skills/gh-imgup/
│   └── SKILL.md          # Agent skill definition
├── gh-imgup              # gh extension wrapper (shell script)
├── package.json
├── tsconfig.json
├── LICENSE
├── README.md
├── SECURITY.md
└── CHANGELOG.md
```

Zero runtime dependencies: the entire audit surface is the `src/` TypeScript plus Node.js built-ins.

---

## Contributing

Development conventions (branches, pull requests, commits, build commands, and the security invariants that define the project) live in [AGENTS.md](AGENTS.md). Human contribution guidance is in [CONTRIBUTING.md](CONTRIBUTING.md). The reasoning trail is in the [devlog](devlog/), and the full design spec is in [`docs/design.md`](docs/design.md).

## License

This work is licensed under [GPL-3.0-or-later](./LICENSE).

See [LICENSING-PHILOSOPHY.md](./LICENSING-PHILOSOPHY.md) for why we chose this license.

---

A [Free as in Bird](https://freeasinbird.com) project.
