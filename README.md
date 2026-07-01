# gh-imgup

[![npm](https://img.shields.io/npm/v/@freeasinbird/gh-imgup)](https://www.npmjs.com/package/@freeasinbird/gh-imgup)
[![CI](https://github.com/freeasinbird/gh-imgup/actions/workflows/ci.yml/badge.svg)](https://github.com/freeasinbird/gh-imgup/actions/workflows/ci.yml)

A CLI tool that uploads images to GitHub issues and pull requests using the documented Release Assets API. Designed for agents and CI workflows that need to attach screenshots — particularly before/after UI images — to PRs for human reviewers.

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

**Using an agent (Claude Code, Cursor, Codex)?** Also add the [skill](#agent-skill-claude-code-cursor-codex): `npx -y skills add freeasinbird/gh-imgup` gives the agent the usage guidance and the mandatory pre-upload image review. It does **not** install the CLI — the agent still runs `gh-imgup` from one of the options in [Distribution](#distribution).

---

## Why This Exists

GitHub has no public API for image attachments. The drag-and-drop upload in the web UI uses an internal endpoint that requires browser session cookies and has been explicitly denied as a public API for over five years ([cli/cli#1895](https://github.com/cli/cli/issues/1895)).

This creates a real gap for automated workflows. When an agent or CI job implements a UI change, the most useful artifact for code review is a screenshot — yet there's no supported way to get one into the PR programmatically. The result is PRs that describe visual changes in text, leaving reviewers to check out the branch and see for themselves.

There are a few ways to bridge this gap: reuse a logged-in browser session,
automate a real browser, or upload images through the documented Release Assets
API. `gh-imgup` takes the Release Assets approach and uploads to the **same
repository** the PR or issue lives in, so the repo's existing access controls
apply to the images; it authenticates with a scoped token, contacts only GitHub,
and has no runtime dependencies.

These choices came out of a security review of the problem and of existing tools,
written up in [`docs/design.md`](docs/design.md).

---

## The Primary Use Case

Screenshots in PRs of UI changes, for human reviewers.

A CSS diff doesn't tell a reviewer whether a layout looks correct; a before/after screenshot pair answers that in seconds. Capturing and attaching those screenshots by hand is enough friction that it often gets skipped.

`gh-imgup` automates the upload-and-link step, so the only manual part left is
capturing the screenshots — which an agent with browser access can also do.

### The Agent Workflow

An agent with headless browser access (Playwright MCP, Chrome DevTools MCP, or shell access to run a script) can automate the full cycle:

```
1. Check out main, start dev server, screenshot the component    → before.png
2. Check out PR branch, restart, screenshot the same component   → after.png
3. gh-imgup before.png after.png                                → Markdown links
4. Put those Markdown links in the PR description or issue body
```

The reviewer opens the PR and sees the images inline in the body, before any
follow-up discussion. No branch checkout, no local dev server, no context
switching.

The workflow is agent-agnostic: any agent that can drive a headless browser (for
example via Playwright) to capture the screenshots can then call `gh-imgup` to
upload them and get embeddable Markdown. Capture and PR/issue body composition
are the agent's responsibility; this tool handles only upload and Markdown
output.

When an agent is creating or editing the PR/issue body, the preferred flow is to
run `gh-imgup` without `--pr` / `--issue`, capture stdout, and compose that
Markdown into the body. The `--pr` / `--issue` flags remain useful when the
thread already exists and a follow-up comment is the right surface, such as a CI
job adding visual evidence after a PR is open.

### Other Use Cases

- Visual regression evidence included in a PR description or comment
- Error screenshots included in bug reports
- Test result images (charts, rendered components) added to issues
- Architecture diagrams or design mockups embedded in discussions
- Any image a human reviewer would benefit from seeing alongside code

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

### Output

Stdout receives only machine-parseable output. Stderr receives progress, warnings, and errors.

```bash
# Default — markdown image reference, suitable for a PR/issue body
$ gh-imgup screenshot.png
![screenshot](https://github.com/owner/repo/releases/download/_gh-imgup/screenshot-a1b2c3d4.png)

# JSON — always an array (one object per file), for piping into other tools
$ gh-imgup screenshot.png --json
[{"url":"https://...","markdown":"![screenshot](...)","filename":"screenshot.png","repo":"owner/repo","digest":"sha256:abc123..."}]

# Multiple images for body composition
$ gh-imgup before.png after.png
![before](https://github.com/.../before-e5f6a7b8.png)
![after](https://github.com/.../after-c9d0e1f2.png)
```

For an agent creating or editing a PR/issue body, compose the stdout Markdown
into that body:

```bash
{
  printf '## Screenshots\n\n'
  gh-imgup before.png after.png --repo owner/repo
} > pr-body.md && gh pr create --body-file pr-body.md
```

For an already-open thread where a follow-up comment is desired, use comment
mode:

```bash
gh-imgup before.png after.png --pr 42 -m "Button component — visual diff"
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

This example uses comment mode because the PR already exists by the time a
`pull_request` workflow runs. Agents creating or editing the PR body should use
the stdout-composition flow above instead.

---

## How It Works

### Upload Mechanism

Images are uploaded as Release Assets on the same repository where the PR or issue lives, under a prerelease tagged `_gh-imgup`. The GitHub REST API returns a `browser_download_url` that renders in any GitHub markdown context — issue bodies, PR descriptions, comments.

```
https://github.com/{owner}/{repo}/releases/download/_gh-imgup/{filename}
```

On private repos, this URL is only accessible to users with repo access. The access model is inherited automatically — no separate hosting configuration needed.

### Authentication

The tool uses `GITHUB_TOKEN`, the standard mechanism for GitHub API access. In GitHub Actions, this is provided automatically. Locally, it can be a fine-grained Personal Access Token scoped to a single repository, or the token stored by the `gh` CLI.

Required scopes: `contents:write` for uploading, plus `issues:write` if commenting on a PR or issue.

The tool never reads browser cookies and never opens a browser. The token is read from the environment (or the `gh` CLI), held in memory, sent only to `api.github.com` / `uploads.github.com` over HTTPS for the requests it makes, and never written to disk. All error messages are sanitized to strip token values before printing.

### Upload Flow

1. **Ensure the `_gh-imgup` prerelease exists** on the target repo (create if missing, with a race-condition-safe create-or-get pattern)
2. **Validate the file**: check existence, size (via `stat()` before reading), and the extension against a strict allowlist (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`), each mapped to a fixed MIME type
3. **Upload** as a release asset via `POST https://uploads.github.com/...` with a collision-safe filename (`{stem}-{8-char-hex}.{ext}`)
4. **Verify integrity**: compare local SHA-256 against the API response digest; delete and fail on mismatch
5. **Return Markdown** on stdout for the caller to embed; optionally, with
   `--pr` / `--issue`, post the Markdown as a comment via the Issues API

All GitHub interaction uses `fetch()`. The compiled CLI makes exactly two subprocess calls ever — `gh auth token` (fallback auth) and `git remote get-url origin` (repo inference) — both via `execFileSync` with array arguments (no shell, no string interpolation, no user input in the array). (The `gh`-extension wrapper is a thin bootstrap shell script that builds/locates `dist/` and forwards arguments to `node`.)

---

## Security Model

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

### Credential Scope

With a fine-grained PAT scoped to `contents:write` + `issues:write` on one repo:

**Can:** create prereleases, upload assets, comment on issues/PRs — on that repo only.

**Cannot:** access other repos, change account settings, manage SSH keys, read private repos not in scope.

**Honest limitation:** `contents:write` also permits pushing commits. There is no `releases:write`-only scope in GitHub's current permission model. Use a short-lived, single-repo fine-grained PAT to minimize blast radius.

### Agent Image Safety

In agentic workflows, the agent decides what to screenshot. The SKILL.md includes a mandatory pre-upload review instruction: examine every image for API keys, tokens, secrets, internal URLs, PII, or other sensitive content before uploading. If any are found, refuse the upload and tell the user what was detected.

This is the highest-impact security control in the system. The upload mechanism is secure — the risk is in what gets uploaded.

---

## Known Tradeoffs

These are inherent to the Release Assets approach. The design accepts them with open documentation rather than hiding them.

### Images are browsable on public repos

Anyone can visit `https://github.com/{owner}/{repo}/releases/tag/_gh-imgup` and see every uploaded image. This is worse than GitHub's native `user-attachments/assets/{uuid}` model (which has no public index). On private repos this is a non-issue — only users with repo access can see the releases page.

Draft releases would solve the enumerability problem but break image rendering (GitHub returns 404 when resolving draft releases by tag). Prereleases are the only viable option.

### `contents:write` is broader than ideal

There is no `releases:write`-only scope. The same token that uploads images could push code. Use a fine-grained PAT with the shortest practical expiration, scoped to exactly one repository.

### Images persist until deleted

Release assets don't auto-expire. `gh-imgup --cleanup` interactively removes unreferenced assets (scanning all issue/PR bodies and comments). Full release deletion is a manual `gh release delete` operation — intentionally not automated because it breaks every previously-embedded image.

The prerelease is labeled `⚠️ Image assets — do not delete` with a description explaining the consequences.

### Not the same URL format as drag-and-drop

GitHub's web UI produces `user-attachments/assets/{uuid}` URLs. This tool produces `releases/download/_gh-imgup/{filename}` URLs. Both render identically in GitHub markdown. The only functional difference: `user-attachments` are GitHub-managed and eventually cleaned up; release assets persist until explicitly deleted.

---

## Versioning

`gh-imgup` is **0.x** while real-world usage accrues: the CLI flags and the
machine-output contract (`--json` / `--raw` / exit codes) are stable by intent,
but `0.x` means they are not yet a frozen semver promise. `1.0.0` will freeze
them, cut once usage justifies committing to that guarantee.

---

## Distribution

### npm

Run it zero-install with `npx -y @freeasinbird/gh-imgup …`. For repeat use — or
any agent whose approval reviewer refuses to run unpinned downloaded code (Codex,
see below) — install a **pinned** version once and invoke the bare `gh-imgup`:

```bash
npm i -g @freeasinbird/gh-imgup@0.1.2   # pin the current version; `npm view @freeasinbird/gh-imgup version`
gh-imgup screenshot.png --repo owner/repo
```

Pin a version in CI the same way, e.g. `npx -y @freeasinbird/gh-imgup@0.1.0 …`.
When you run it from a different repo's checkout (e.g. the gh-imgup source)
rather than your project's, pass `--repo owner/repo` — otherwise it infers the
repo from that checkout's git remote.

Two things matter for the npx form:

- **Keep the `-y`.** Without it, npx's first-run `Ok to proceed?` prompt on an
  uncached package blocks a non-interactive agent or CI job. `-y` (short for
  `--yes`) skips it.
- **Keep the `@freeasinbird/` scope.** A bare `npx gh-imgup` resolves to the
  *unscoped* `gh-imgup` name on the registry — a different package, not this
  one. Always invoke the scoped name.

### Pre-authorize for agents

To let an agent reach for the tool without a per-run approval prompt, pick one of
two forms and allowlist that exact string:

- **Zero-install** — `npx -y @freeasinbird/gh-imgup …`. Convenient, but every run
  re-downloads and executes freshly-resolved package code. Some agents' approval
  reviewers (Codex) refuse to auto-approve that, `-y` or not — see below.
- **Pinned pre-installed (recommended for repeat use / strict reviewers)** —
  install once (`npm i -g @freeasinbird/gh-imgup@X.Y.Z`) and allowlist the bare
  `gh-imgup`. Auditable once, no per-run download, and it passes stricter
  reviewers.

The `-y` is what makes the npx form non-interactive; the allowlist is what makes
either form non-prompting.

**Claude Code.** Auto-running a shell command without a prompt is an allowlist
decision (a skill can't self-authorize), delivered any of these ways:

- Add an allow rule to `~/.claude/settings.json` (covers every repo you work in).
  For the recommended pinned form:

  ```json
  {
    "permissions": {
      "allow": ["Bash(gh-imgup *)"]
    }
  }
  ```

  For the zero-install form instead, use `"Bash(npx -y @freeasinbird/gh-imgup *)"`.
  Add only the rule for the form you actually run — the npx rule grants the
  unpinned download-and-run path the pinned form avoids, so don't include it if
  you chose the pinned form to sidestep exactly that. Put the rule in a repo's
  checked-in `.claude/settings.json` to share it with a team; rules merge across
  scopes and never loosen a `deny`.
- Or, on the first approval prompt, choose **"Yes, and don't ask again…"** — that
  writes the matching rule for the command you just ran.
- Or pass it per session: `--allowedTools 'Bash(gh-imgup *)'` (or the npx rule).

The rule's trailing ` *` (space before the wildcard) matches
`npx -y @freeasinbird/gh-imgup a.png …` but not a version-pinned
`…@0.1.0` (no space before `@`); if you pin in CI, add
`Bash(npx -y @freeasinbird/gh-imgup@*)` too. Scope the rule to this package —
a blanket `Bash(npx *)` would auto-approve any package and is a supply-chain
risk.

**Codex** doesn't read Claude settings, and its model-based approval reviewer
refuses to auto-run `npx` — it correctly sees "download and run an *unpinned*
package with credential access," which `-y` does nothing to change (`-y` only
suppresses npx's own prompt, not Codex's approval gate). Give it the pinned
pre-installed form instead:

1. **Pin** — `npm view @freeasinbird/gh-imgup version`.
2. **Install trusted** — `npm i -g @freeasinbird/gh-imgup@X.Y.Z`.
3. **Approve a narrow persistent prefix** for the installed command — `["gh-imgup"]`.
   Choose Codex's persistent "always allow" when prompted.

Don't blanket-allow `npx`, `npm exec --package`, or the unpinned scope: that
grants whatever code those resolve to *next* time full access to your local files
and GitHub credentials. A pinned, pre-installed binary is auditable once and
carries no such open door. On **Codex Cloud**, put the install line in the
environment setup script and allow the `api.github.com` and `uploads.github.com`
domains (the environment rebuilds per task, so the setup script is where it
persists).

### `gh` CLI extension

```bash
gh extension install freeasinbird/gh-imgup
gh imgup screenshot.png
```

The extension is compiled from source, so on first run it prints a one-time
build command (`npm ci --include=dev && npm run build` in the extension
directory) — run it once. This is the only step that touches the npm registry;
afterward, running the tool contacts GitHub only, and works offline. Later
upgrades rebuild automatically from the already-installed toolchain.

Normal versioned GitHub Releases are compatible with this source-install
extension path. `gh extension install` keeps using the source-clone/script path
as long as the latest *release* carries no prebuilt extension binaries; it
switches to downloading a binary only when a release asset's name ends in a
platform `<os>-<arch>` suffix (e.g. `…-linux-amd64`, `…-windows-amd64.exe`) —
and that's *any* attached asset, not just a `gh-imgup-<os>-<arch>` binary, since
`gh` suffix-matches every asset name. GitHub's automatic source archives don't
count. So a normal versioned release with just notes keeps the source build
above and does **not** need to ship binaries; just keep every attached asset's
name clear of those suffixes unless the project deliberately adopts a precompiled
binary extension. (The `_gh-imgup` image-asset prerelease is ignored regardless —
gh skips prereleases.)

### Agent skill (Claude Code, Cursor, Codex)

The skill definition lives at [`skills/gh-imgup/SKILL.md`](skills/gh-imgup/SKILL.md).
Install it with the [`skills` CLI](https://github.com/vercel-labs/skills):

```bash
npx -y skills add freeasinbird/gh-imgup   # install
npx -y skills update                       # update installed skills to the latest
```

`skills add` reads the repository's default branch, so it works once the skill is
merged there. You can also copy `SKILL.md` into your agent's skills directory by
hand. Either way, the agent picks up the tool and its mandatory pre-upload
image-review step together.

---

## Design Process

This tool was designed through adversarial iteration: three existing tools were security-audited to understand the problem space, a solution was proposed, that proposal underwent two rounds of security audit with all findings addressed, and the architecture was refined through each pass. The design spec from that process lives in [`docs/design.md`](docs/design.md).

Key decisions and their rationale:

- **Same-repo release assets** instead of a separate hosting repo — access controls inherited for free, no public exposure of private repo images
- **`fetch()` only** for GitHub operations — structurally eliminates shell injection rather than defending against it with escaping
- **Zero dependencies** — supply chain attack surface is the tool itself and Node built-ins, nothing else
- **No third-party fallback** — if credentials are missing, fail clearly; never silently ship data to a service the user didn't choose
- **No automated destructive cleanup** — safe cleanup is interactive, full deletion is manual; the release carries its own warning label
- **Pre-upload image review in the agent skill** — the upload mechanism is secure, so the highest risk is what gets uploaded, and that's where the safety control goes
- **SVG excluded from MIME allowlist** — active content format, screenshots are raster; can be added behind `--allow-svg` if needed
- **Tag prefix validation** (`_` required) — prevents `--tag v2.0.0` from polluting real releases
- **SHA-256 integrity check** — corrupted uploads are detected and cleaned up, not silently accepted
- **`gh-imgup` not `gh-img`** — avoids confusion with the similarly named `gh-image`

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

Zero runtime dependencies — the entire audit surface is the `src/` TypeScript plus Node.js built-ins.

---

## Contributing

Development conventions — branches, pull requests, commits, build commands, and the security invariants that define the project — live in [AGENTS.md](AGENTS.md). Human contribution guidance is in [CONTRIBUTING.md](CONTRIBUTING.md). The reasoning trail is in the [devlog](devlog/), and the full design spec is in [`docs/design.md`](docs/design.md).

## License

This work is licensed under [GPL-3.0-or-later](./LICENSE).

See [LICENSING-PHILOSOPHY.md](./LICENSING-PHILOSOPHY.md) for why we chose this license.

---

A [Free as in Bird](https://freeasinbird.com) project.
