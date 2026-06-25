# gh-imgup

A CLI tool that uploads images to GitHub issues and pull requests using the documented Release Assets API. Designed for agents and CI workflows that need to attach screenshots — particularly before/after UI images — to PRs for human reviewers.

> **Status: pre-release / in development.** The toolchain, tests, and CI are
> in place, but the upload pipeline is not yet implemented — the CLI currently
> handles only `--help`/`--version`. The commands and behavior below describe
> the target design (see [`docs/design.md`](docs/design.md)); they do not
> all work yet, and the package is not published. Follow development in
> [AGENTS.md](AGENTS.md) and the [devlog](devlog/).

---

## Why This Exists

GitHub has no public API for image attachments. The drag-and-drop upload in the web UI uses an internal endpoint that requires browser session cookies and has been explicitly denied as a public API for over five years ([cli/cli#1895](https://github.com/cli/cli/issues/1895)).

This creates a real gap for automated workflows. When an agent or CI job implements a UI change, the most useful artifact for code review is a screenshot — yet there's no supported way to get one into the PR programmatically. The result is PRs that describe visual changes in text, leaving reviewers to check out the branch and see for themselves.

Three existing tools attempt to solve this. Each has a fundamental flaw:

- **`gh-image`** decrypts browser cookies from disk to replay session tokens — the same technique used by info-stealer malware. Grants full, unscoped account access.
- **`github-upload-image-to-pr`** is an AI agent skill that drives a real browser via Chrome DevTools or Playwright MCP. Gives the agent full control of every tab and every logged-in session.
- **`gitshot`** uploads images as GitHub Release Assets (a sound approach) but defaults to a separate **public** repository and silently falls back to catbox.moe, an anonymous third-party file host.

`gh-imgup` takes the Release Assets approach and fixes its problems: uploads to the **same repo** (inheriting access controls), uses scoped `GITHUB_TOKEN` credentials, never contacts third-party services, and has zero runtime dependencies.

---

## The Primary Use Case

Screenshots in PRs of UI changes, for human reviewers.

A CSS diff doesn't tell a reviewer whether a layout looks correct. A before/after screenshot pair answers that question in seconds. Every frontend team with good PR hygiene wants this in their reviews — most skip it because the manual workflow is high-friction.

`gh-imgup` eliminates that friction, especially when paired with an agent that can capture screenshots.

### The Agent Workflow

An agent with headless browser access (Playwright MCP, Chrome DevTools MCP, or shell access to run a script) can automate the full cycle:

```
1. Check out main, start dev server, screenshot the component    → before.png
2. Check out PR branch, restart, screenshot the same component   → after.png
3. gh-imgup before.png after.png --pr 42 -m "Visual diff"
```

The reviewer opens the PR and sees the images inline. No branch checkout, no local dev server, no context switching.

This works today with Claude Code, Codex, or any agent that can run Playwright in headless mode. The screenshot capture is the agent's responsibility — `gh-imgup` handles only the upload and PR attachment. Clean separation: capture is not this tool's job.

### Other Use Cases

- Visual regression evidence attached to a PR
- Error screenshots attached to bug reports
- Test result images (charts, rendered components) posted to issues
- Architecture diagrams or design mockups embedded in discussions
- Any image a human reviewer would benefit from seeing alongside code

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

The tool never reads browser cookies, never opens a browser, and never stores or transmits credentials beyond the single API call. All error messages are sanitized to strip token values before printing.

### Upload Flow

1. **Ensure the `_gh-imgup` prerelease exists** on the target repo (create if missing, with a race-condition-safe create-or-get pattern)
2. **Validate the file**: check existence, size (via `stat()` before reading), and MIME type against a strict allowlist (PNG, JPG, GIF, WebP)
3. **Upload** as a release asset via `POST https://uploads.github.com/...` with a collision-safe filename (`{stem}-{8-char-hex}.{ext}`)
4. **Verify integrity**: compare local SHA-256 against the API response digest; delete and fail on mismatch
5. **Comment on the PR/issue** (optional): post the markdown image reference via the Issues API

All GitHub interaction uses `fetch()`. The tool makes exactly two subprocess calls in total — `gh auth token` (fallback auth) and `git remote get-url origin` (repo inference) — both using `execFileSync` with array arguments (no shell, no string interpolation).

---

## CLI Reference

```
gh-imgup <file...> [options]

Options:
  --repo <owner/repo>   Target repository (default: inferred from git remote)
  --pr <number>         Comment on a pull request
  --issue <number>      Comment on an issue
  -m, --message <text>  Caption to include with the image(s)
  --json                JSON output to stdout
  --raw                 Raw URL(s) only
  --tag <name>          Release tag (default: _gh-imgup, must start with _)
  --max-size <MB>       Max file size in MB (default: 25)
  --cleanup             Interactively delete unreferenced assets
  -h, --help            Show help
  -v, --version         Show version

Environment:
  GITHUB_TOKEN          Required. GitHub token with contents:write scope.
                        In GitHub Actions: automatic (add permissions block).
                        Locally: export GITHUB_TOKEN=$(gh auth token)
```

### Output

Stdout receives only machine-parseable output. Stderr receives progress, warnings, and errors.

```bash
# Default — markdown image reference
$ gh-imgup screenshot.png --pr 42
![screenshot](https://github.com/owner/repo/releases/download/_gh-imgup/screenshot-a1b2c3d4.png)

# JSON — for piping into other tools
$ gh-imgup screenshot.png --json
{"url":"https://...","markdown":"![screenshot](...)","filename":"screenshot.png","digest":"sha256:abc123..."}

# Multiple images with caption
$ gh-imgup before.png after.png --pr 42 -m "Button component — visual diff"
![before](https://github.com/.../before-e5f6a7b8.png)
![after](https://github.com/.../after-c9d0e1f2.png)
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

      - name: Upload to PR
        run: npx gh-imgup before.png after.png --pr ${{ github.event.pull_request.number }} -m "Visual diff"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

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

### Comparison with Existing Tools

| Property | `gh-imgup` | `gh-image` | tonkotsuboy skill | `gitshot` |
|---|---|---|---|---|
| Auth | `GITHUB_TOKEN` / fine-grained PAT | Stolen browser cookie | Browser automation | `gh` CLI token |
| Min scope | `contents:write` on one repo | Full GitHub account | Full browser (all sites) | `repo` scope |
| API | Documented REST | Undocumented internal | Undocumented (via browser) | Documented REST |
| Shell injection | Impossible (no shell exec for GitHub ops) | N/A (Go) | N/A (prompt) | Unquoted `execSync` |
| 3rd party data | None | None | None | catbox.moe fallback |
| Runtime deps | Zero | `kooky` + transitive | None (prompt file) | Zero |
| Private repo | Private (same-repo assets) | Private (`user-attachments`) | Private (`user-attachments`) | **Public** (separate repo) |
| Upload integrity | SHA-256 verified | None | None | None |
| Token sanitization | All error paths | None | N/A | None |

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

## Distribution

### npm (primary)

```bash
npx gh-imgup screenshot.png --pr 42      # zero-install
npm install -g gh-imgup                   # global install
npx gh-imgup@1.0.0 screenshot.png        # pinned version (CI)
```

### `gh` CLI extension

```bash
gh extension install freeasinbird/gh-imgup
gh imgup screenshot.png --pr 42
```

The extension is compiled from source, so on first run it prints a one-time
build command (`npm ci --include=dev && npm run build` in the extension
directory) — run it once. This is the only step that touches the npm registry;
afterward, running the tool contacts GitHub only, and works offline. Later
upgrades rebuild automatically from the already-installed toolchain.

`gh extension install` uses this source-clone path only while the repo has no
published *release* — it otherwise expects prebuilt extension binaries in the
release (the `_gh-imgup` image-asset prerelease is ignored, since gh skips
prereleases). So a normal versioned release must either ship gh-extension
binaries or document a pinned/local install; until one is cut, the source build
above is what runs.

### Agent skill (Claude Code, Cursor, Codex)

```bash
npx skills add freeasinbird/gh-imgup
```

Ships the `skills/gh-imgup/SKILL.md` alongside the CLI. Agents discover the tool and the pre-upload safety instructions together.

### Repo Layout

```
gh-imgup/
├── src/
│   ├── index.ts          # CLI arg parsing, orchestration
│   ├── auth.ts           # Token resolution, scope warnings, error sanitization
│   ├── release.ts        # Create-or-get release, upload asset, verify digest
│   ├── github.ts         # Comment on PR/issue
│   ├── validate.ts       # Repo, tag, number, file, MIME, remote URL parsing
│   ├── cleanup.ts        # Scan issues/PRs for references, interactive deletion
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

~400 lines of TypeScript. Zero runtime dependencies. The entire audit surface is 7 source files using Node.js built-ins.

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
- **`gh-imgup` not `gh-img`** — avoids confusion with `gh-image` (drogers0), which is one character away and has the opposite security model

---

## Contributing

Development conventions — branches, pull requests, commits, build commands, and the security invariants that define the project — live in [AGENTS.md](AGENTS.md). Human contribution guidance is in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

This work is licensed under [GPL-3.0-or-later](./LICENSE).

See [LICENSING-PHILOSOPHY.md](./LICENSING-PHILOSOPHY.md) for why we chose this license.
