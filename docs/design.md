# `gh-imgup`: Secure Image Uploads for GitHub Issues & PRs

## Design Spec

---

## Problem

GitHub has no public API for image attachments in issues/PRs. The drag-and-drop upload in the web UI uses an internal endpoint (`/upload/policies/assets`) that requires browser session cookies and has been explicitly denied as a public API for over five years ([cli/cli#1895](https://github.com/cli/cli/issues/1895)). The internal endpoint cannot be used with any form of API token — it requires three chained CSRF tokens, each bound to browser session cookies.

Three existing workarounds were security-audited as part of this design process:

- **`gh-image`** decrypts browser cookies from disk using the `kooky` library — the same technique as info-stealer malware. Grants full, unscoped GitHub account access.
- **`github-upload-image-to-pr`** is an AI agent skill that drives a real browser via Chrome DevTools or Playwright MCP. Gives the agent full control of every tab and every logged-in session.
- **`gitshot`** uses GitHub Release Assets (a sound approach) but defaults to a separate **public** repo, silently falls back to catbox.moe, and has shell injection surface via unquoted `execSync` arguments.

`gh-imgup` takes the Release Assets approach and fixes its problems.

### Why `gh-imgup`, not `gh-img`

`gh-image` (drogers0) already exists. The `gh` CLI strips the `gh-` prefix for subcommands, so `gh-img` would be `gh img` — one character from `gh image`, with the opposite security model. `gh-imgup` avoids that confusion.

---

## Primary Use Case

Screenshots in PRs of UI changes, for human reviewers. A CSS diff doesn't tell a reviewer whether a layout looks correct. A before/after screenshot pair answers that question in seconds. Most teams skip this because the manual workflow (capture, switch to browser, drag into textarea, paste markdown) is high-friction.

### Agent Screenshot Workflow

An agent with headless browser access (Playwright MCP, Chrome DevTools MCP, or shell access) can automate the full cycle:

```
1. Check out main, start dev server, screenshot the component    → before.png
2. Check out PR branch, restart, screenshot the same component   → after.png
3. gh-imgup before.png after.png --pr 42 -m "Visual diff"
```

The reviewer opens the PR and sees the images inline. No branch checkout, no local dev server.

This works today with Claude Code, Codex, or any agent with Playwright in headless mode. Screenshot capture is the agent's responsibility — `gh-imgup` handles only the upload and PR attachment. Clean separation of concerns.

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
      - run: npm ci
      - name: Capture screenshots
        run: |
          npx playwright screenshot http://localhost:3000/component before.png
          # (build PR branch, screenshot again as after.png)
      - name: Upload to PR
        run: npx gh-imgup before.png after.png --pr ${{ github.event.pull_request.number }} -m "Visual diff"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## Architecture

Upload images as Release Assets on the **same repo** where the PR/issue lives. All GitHub interaction via `fetch()`. Zero runtime dependencies. Zero shell interpolation for GitHub operations.

```
gh-imgup <file...> --repo owner/repo [--pr N | --issue N] [--json]
```

### Auth: `GITHUB_TOKEN`

Single env var. Resolution:

1. `GITHUB_TOKEN` env var — could be a fine-grained PAT (ideal) or classic token
2. If not set, run `execFileSync('gh', ['auth', 'token'])` to extract the `gh` CLI's stored token
3. If neither available (including `gh` not installed — handle `ENOENT`), fail with instructions

**Honest scoping disclosure.** The `gh auth token` fallback typically returns a classic OAuth token with broad `repo` scope, not a repo-scoped fine-grained PAT. The tool warns on stderr when using it:

```
⚠ Using gh CLI token (broad scope). For tighter security, set GITHUB_TOKEN to a fine-grained PAT.
```

**Token validation.** Reject empty strings. On any API error, sanitize the error message before printing — strip any occurrence of the token value so it never leaks to terminal output, CI logs, or agent context:

```typescript
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  const safe = token ? msg.replaceAll(token, '[REDACTED]') : msg;
  throw new Error(safe);
}
```

### Required token permissions

| Operation | Scope needed |
|---|---|
| Upload release assets | `contents:write` |
| Comment on PR/issue | `issues:write` |
| Upload only (no comment) | `contents:write` alone |
| Cleanup (scan references) | `issues:read` (in addition to `contents:write` for deletion) |

The tool detects a 403 on any step and tells the user exactly which scope is missing, rather than printing a raw API error.

**`contents:write` is broader than we'd like.** It also permits pushing commits, creating/deleting tags, and creating/deleting files via the Contents API. There is no `releases:write`-only scope in GitHub's current permission model. If the token leaks, an attacker can push code. The tool documents this tradeoff explicitly in its help output and README.

**GitHub Actions note.** The default `GITHUB_TOKEN` has `contents: write` on `push` events but only `contents: read` on `pull_request` events. PR-triggered workflows (the most natural use case) need explicit permissions:

```yaml
permissions:
  contents: write
  issues: write
```

---

## Upload Flow

### Step 1: Ensure release exists (create-or-get)

Check for a release tagged `_gh-imgup` on the target repo. Create as a **prerelease** if missing.

```
GET /repos/{owner}/{repo}/releases/tags/_gh-imgup
  → 200: extract release_id
  → 404: create ↓

POST /repos/{owner}/{repo}/releases
  { "tag_name": "_gh-imgup",
    "name": "⚠️ Image assets — do not delete",
    "body": "This release hosts images embedded in issues and PRs.\nDeleting it will break every image reference across this repo.\n\nManaged by gh-imgup.",
    "prerelease": true,
    "generate_release_notes": false }
  → 201: extract release_id
  → 422 (tag exists, race condition): retry GET
```

**Race condition handling.** If two agents or CI jobs hit this simultaneously, both see 404, both try to create, one gets 422. On 422, retry the GET. Standard create-or-get pattern. On 422 for any other reason (check error message), fail with the original error.

**Why prerelease, not draft.** Draft releases can't be found by tag (`GET /releases/tags/{tag}` returns 404 for drafts), which means the `browser_download_url` — resolved via tag — almost certainly 404s too. Prereleases are findable by tag and their asset URLs resolve correctly. The cost: they're visible on the repo's releases page.

### Step 2: Upload the image

**File size check first.** `stat()` the file before reading it into memory. Reject if it exceeds `--max-size` (default 25MB). This prevents loading a 2GB file into memory only to reject it.

```typescript
const stats = statSync(filepath);
if (stats.size > maxBytes) {
  throw new Error(`File ${filepath} is ${mb(stats.size)}MB, exceeds --max-size ${maxMB}MB`);
}
const fileBytes = readFileSync(filepath);
```

**Upload request:**

```
POST https://uploads.github.com/repos/{owner}/{repo}/releases/{release_id}/assets
  ?name={encodeURIComponent(safe_filename)}
  Content-Type: {mime_type}
  Body: raw file bytes
```

**Filename sanitization.** `{stem}-{8-char-hex}.{ext}`. The hex suffix comes from `randomUUID()`, never from user input. The filename is URI-encoded in the query parameter.

**MIME type allowlist.** Strict map, not inferred:

```typescript
const MIME: Record<string, string> = {
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
};
```

Anything not in the map is rejected. No guessing, no `application/octet-stream` fallback.

**SVG excluded.** SVG files can contain embedded JavaScript, CSS, and external resource references (`<image href="https://evil.com/tracker.png">`). GitHub's CDN mitigates most risks via Content-Security-Policy headers, but SVG is the only "active content" format and the primary use case (screenshots) produces raster images exclusively. If SVG support is needed later, it can be added behind an `--allow-svg` flag with an explicit warning.

**Upload integrity verification.** Compute SHA-256 of the local file before upload. Compare against the `digest` field in the API response:

```typescript
const localDigest = createHash('sha256').update(fileBytes).digest('hex');
const remoteDigest = response.digest?.replace('sha256:', '');
if (remoteDigest) {
  if (localDigest !== remoteDigest) {
    await deleteAsset(token, owner, repo, response.id);
    throw new Error(`Integrity check failed: local ${localDigest} != remote ${remoteDigest}`);
  }
} else {
  process.stderr.write('⚠ Server did not return digest — integrity not verified\n');
}
```

When the digest is absent (API version difference, schema change), the tool warns on stderr rather than silently passing. The upload isn't failed — it may be fine — but there's an audit trail that verification didn't happen.

### Step 3 (optional): Comment on PR or issue

```
POST /repos/{owner}/{repo}/issues/{number}/comments
  { "body": "![screenshot](https://github.com/.../releases/download/_gh-imgup/screenshot-a1b2c3d4.png)" }
```

---

## Input Validation

### Repo format

```typescript
function validateRepo(input: string): { owner: string; name: string } {
  const match = input.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (!match) throw new Error(`Invalid repo: "${input}". Expected: owner/repo`);
  const [, owner, name] = match;
  if (owner === '.' || owner === '..' || name === '.' || name === '..') {
    throw new Error(`Invalid repo component: "${input}"`);
  }
  return { owner, name };
}
```

Rejects `..`, `.`, empty components. These would be harmless (GitHub's API would reject them too) but defense-in-depth says don't rely on server-side validation alone.

### Release tag

```typescript
function validateTag(tag: string): string {
  if (!tag.startsWith('_')) {
    throw new Error(
      `Tag "${tag}" rejected: must start with "_" to avoid colliding with real release tags.\n` +
      `Default: _gh-imgup`
    );
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(tag)) {
    throw new Error(`Tag "${tag}" contains invalid characters.`);
  }
  return tag;
}
```

The `_` prefix prevents `--tag v2.0.0` from polluting production releases. The default `_gh-imgup` satisfies this. Users who want a custom tag must use the `_` prefix convention.

### PR/issue number

```typescript
function validateNumber(input: string): number {
  const n = parseInt(input, 10);
  if (!Number.isInteger(n) || n <= 0 || String(n) !== input) {
    throw new Error(`Invalid issue/PR number: "${input}"`);
  }
  return n;
}
```

The `String(n) !== input` check rejects inputs like `42abc` that `parseInt` would silently truncate.

### File validation

`stat()` the file to verify it exists and check size before reading. Reject if not in the MIME allowlist or exceeds `--max-size`.

### Git remote URL parsing

```typescript
function parseGitRemoteUrl(remote: string): { owner: string; name: string } {
  // https://github.com/owner/repo.git
  // https://github.com/owner/repo
  // git@github.com:owner/repo.git
  const https = remote.match(/github\.com\/([^/]+)\/([^/.]+)/);
  const ssh = remote.match(/github\.com:([^/]+)\/([^/.]+)/);
  const match = https ?? ssh;
  if (!match) {
    throw new Error(
      `Could not parse GitHub repo from remote: ${remote}\n` +
      `Only github.com remotes are supported. Pass --repo owner/repo explicitly.`
    );
  }
  return validateRepo(`${match[1]}/${match[2]}`);
}
```

Explicitly rejects GitHub Enterprise URLs (non-`github.com` hosts) since API endpoints are hardcoded to `api.github.com`. Tells the user to pass `--repo` explicitly.

---

## Security Model

### No shell injection

All GitHub API calls use `fetch()`. The tool makes exactly **two** subprocess calls, both using `execFileSync` with array arguments (no shell, no string interpolation):

1. `execFileSync('gh', ['auth', 'token'])` — token resolution fallback
2. `execFileSync('git', ['remote', 'get-url', 'origin'])` — repo inference

Neither includes user input in the argument array. `execFileSync` with an array bypasses the shell entirely — no concatenation, no interpolation, no quoting bugs. Both calls are guarded with try/catch and have a `timeout` (5 seconds) to prevent hangs.

### No third-party exfiltration

Network requests go to exactly two hostnames: `api.github.com` and `uploads.github.com`. If the token is missing or invalid, the tool fails with an error. It never falls back to an alternative upload destination.

### Token sanitization

Every API error path strips the token value from the error message before printing. The token never appears in stderr output, CI logs, or agent context.

### Zero runtime dependencies

`package.json` has only `typescript` and `@types/node` as devDependencies. The published artifact is compiled JS using Node built-ins: `node:fs`, `node:path`, `node:crypto`, `node:child_process` (two calls), global `fetch`. No `node_modules` graph to audit.

---

## Known Tradeoffs

These are inherent to the Release Assets approach. The design doesn't hide them.

### 1. Images are enumerable on public repos

Anyone can visit `https://github.com/{owner}/{repo}/releases/tag/_gh-imgup` and browse every uploaded image. This is worse than GitHub's native `user-attachments/assets/{uuid}` model, which has no public index.

**Mitigations applied:**
- The release is created as a **prerelease**, which de-emphasizes it on the releases page (no "Latest" badge, sorted below published releases)
- On **private repos**, this is a non-issue: only authenticated users with repo access can see the releases page

**Mitigations considered and rejected:**
- **Draft releases:** asset download URLs 404 because GitHub can't resolve drafts by tag. Breaks image rendering.
- **Randomized tag names:** marginal obscurity gain, breaks the create-or-get pattern (tool can't find its own release), adds complexity for negligible security benefit
- **Per-PR tags** (`_imgup-pr-42`): limits enumeration blast radius but creates cleanup complexity and orphan tags

**Honest assessment:** on public repos, this is an accepted downgrade from `user-attachments`. There is no documented API path that matches `user-attachments`' access model. If this tradeoff is unacceptable for your use case, the internal upload API with browser cookies (`gh-image`) is the only alternative — with its own, larger tradeoffs.

### 2. `contents:write` permits more than releasing

There is no `releases:write`-only scope. The token can push code. Use a fine-grained PAT with the shortest possible expiration, scoped to exactly one repo.

### 3. Images persist until explicitly deleted

Release assets don't auto-expire. Over time, the `_gh-imgup` release accumulates. `--cleanup` safely removes unreferenced assets. Full release deletion is a manual operation by design — see [Cleanup](#cleanup).

### 4. Not the same URL format as drag-and-drop

GitHub's web UI produces `user-attachments/assets/{uuid}` URLs. This tool produces `releases/download/_gh-imgup/{filename}` URLs. Both render identically in GitHub markdown. The only functional difference: `user-attachments` are GitHub-managed and eventually cleaned up; release assets persist until explicitly deleted.

---

## Image Content Safety (Agent Skill)

The upload mechanism is secure. The data flowing through it might not be.

In agentic workflows, the agent decides what to screenshot and upload. Realistic failure modes:

- Terminal showing `export GITHUB_TOKEN=ghp_...`
- Error page with internal service URLs or database connection strings
- Dashboard containing customer PII or financial data
- Browser tab where another logged-in service is visible

The SKILL.md includes an explicit pre-upload check instruction. This is not a soft recommendation — it's the highest-impact risk in the entire system:

```
## CRITICAL: Pre-upload image review

Before uploading ANY screenshot or image, you MUST examine it for:
- API keys, tokens, passwords, or secrets (including in terminal output)
- Internal URLs, IP addresses, or infrastructure details
- Personal information (names, emails, addresses, financial data)
- Other browser tabs or applications visible in the screenshot
- Any data that should not be visible to everyone with repo access

If any of the above are present, DO NOT upload the image.
Instead, tell the user what sensitive content you found and ask them
to take a new screenshot with that content redacted or hidden.

On public repos, uploaded images are accessible to anyone on the internet.
On private repos, uploaded images are accessible to all repo collaborators.
```

---

## CLI Interface

```
gh-imgup <file...> [options]

Options:
  --repo <owner/repo>   Target repository (default: inferred from git remote)
  --pr <number>         Comment on a pull request
  --issue <number>      Comment on an issue
  -m, --message <text>  Caption to include
  --json                JSON output to stdout
  --raw                 Raw URL only
  --tag <name>          Release tag (default: _gh-imgup, must start with _)
  --max-size <MB>       Max file size in MB (default: 25)
  --cleanup             Delete unreferenced assets (interactive, see Cleanup)
  -h, --help            Show help (includes scope/tradeoff disclosure)
  -v, --version         Show version

Environment:
  GITHUB_TOKEN          GitHub token with contents:write (+ issues:write for --pr/--issue).
                        Auto-provided in GitHub Actions (see permissions note above).
                        Locally: export GITHUB_TOKEN=$(gh auth token)
```

`--cleanup` is always interactive (prompts for confirmation). There is no `--yes` flag — cleanup should not run unattended because the reference scan cannot guarantee completeness (see [Cleanup](#cleanup)).

### Output contract

**Stdout:** only machine-parseable output (markdown, raw URL, or JSON). Nothing else.
**Stderr:** human-readable progress, warnings, errors.
**Exit 0:** all uploads succeeded. **Exit 1:** any failure.

```
# Default
![screenshot](https://github.com/owner/repo/releases/download/_gh-imgup/screenshot-a1b2c3d4.png)

# --json
{"url":"https://...","markdown":"![screenshot](...)","filename":"screenshot.png","repo":"owner/repo","digest":"sha256:abc123..."}

# --raw
https://github.com/owner/repo/releases/download/_gh-imgup/screenshot-a1b2c3d4.png
```

---

## Cleanup

### Safe cleanup: `--cleanup`

Scans all issues and PRs in the repo (open and closed) for asset URLs referencing the `_gh-imgup` release. Deletes only assets whose URLs appear nowhere in issue/PR bodies or comments. Always interactive — prompts before deleting.

```
gh-imgup --cleanup --repo owner/repo

Scanning issues and PRs for referenced images...
Found 47 assets in _gh-imgup release.
12 are still referenced in issues/PRs.
35 are unreferenced.

⚠ This scan covers issue/PR bodies and comments only.
  Images referenced in README, wiki, or other repo files are NOT detected.
  Review the list before confirming.

Delete 35 unreferenced assets? [y/N]
```

**Scope limitation.** The scan covers issue bodies, PR bodies, and all comments on both. It does **not** cover: wiki pages, README.md, other markdown files in the repo, or discussion posts. This is documented in the prompt itself so the user sees it at the point of decision. There is no `--yes` flag — cleanup always requires human confirmation because the scan is inherently incomplete.

**Requires `issues:read` scope** in addition to `contents:write` for asset deletion. The tool checks for this and reports the missing scope if the scan fails with 403.

### Manual full deletion

If you need to delete the entire release (accepting that all embedded images will break), use the `gh` CLI directly:

```
gh release delete _gh-imgup --cleanup-tag --repo owner/repo
```

This prompts for confirmation. Add `--yes` to skip the prompt if you're certain.

This is intentionally not wrapped by `gh-imgup` — a human should be in the loop for a destructive action that affects every image across the repo. The release itself is labeled `⚠️ Image assets — do not delete` with a description explaining the consequences, so anyone encountering it on the releases page understands what it is before touching it.

---

## Repo Inference

If `--repo` is not provided:

```typescript
try {
  const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
    encoding: 'utf-8',
    timeout: 5000,
  }).trim();
  return parseGitRemoteUrl(remote);
} catch {
  throw new Error('Could not infer repo. Pass --repo owner/repo explicitly.');
}
```

See [Git remote URL parsing](#git-remote-url-parsing) for the parser, which handles HTTPS and SSH formats and explicitly rejects non-`github.com` hosts.

---

## Agent Skill (SKILL.md)

```markdown
---
name: gh-imgup
description: Upload local images to GitHub issues, PRs, and comments
  via the Release Assets API. No browser needed.
---

# gh-imgup

Upload screenshots and images to GitHub issues and PRs.

## When to use

- Attach before/after screenshots of UI changes to a PR
- Embed visual regression evidence in a PR for reviewers
- Upload test result images or rendered components to issues
- Share visual output in a GitHub comment

## Prerequisites

- GITHUB_TOKEN must be set
- In GitHub Actions: automatic (add `permissions: contents: write`)
- Locally: `export GITHUB_TOKEN=$(gh auth token)`
- Or create a fine-grained PAT at https://github.com/settings/tokens
- Token needs `contents:write` scope (add `issues:write` for --pr/--issue)

## CRITICAL: Pre-upload image review

Before uploading ANY screenshot or image, you MUST examine it for:
- API keys, tokens, passwords, or secrets (including in terminal output)
- Internal URLs, IP addresses, or infrastructure details
- Personal information (names, emails, addresses, financial data)
- Other browser tabs or applications visible in the screenshot
- Any data that should not be visible to everyone with repo access

If any sensitive content is present, DO NOT upload. Tell the user what
you found and ask them to retake the screenshot with it redacted.

On public repos, images are accessible to anyone on the internet.
On private repos, images are accessible to all repo collaborators.

## Usage

# Upload + comment on a PR
gh-imgup screenshot.png --pr 42

# Upload + comment on an issue
gh-imgup error.png --issue 10

# Before/after with caption
gh-imgup before.png after.png --pr 42 -m "Visual diff: Button component"

# Upload only (returns markdown)
gh-imgup screenshot.png --repo owner/repo

# Machine-readable output
gh-imgup screenshot.png --json

## Screenshot capture workflow

If you have Playwright or browser access, you can capture and upload
in sequence:

1. Start the dev server
2. Use Playwright to screenshot the component at localhost
3. gh-imgup the screenshot to the PR

The capture is your responsibility. gh-imgup handles the upload.

## How it works

Images are uploaded as Release Assets on the same repository,
under a prerelease tagged `_gh-imgup`. URLs are permanent and
render in any GitHub markdown context. Access inherits the
repo's visibility (private repo = private images).

## Limitations

- Images on public repos are publicly accessible and browsable
  on the repo's releases page.
- `contents:write` scope also permits pushing code. Use a
  fine-grained PAT with short expiration, scoped to one repo.
- This tool only communicates with api.github.com and
  uploads.github.com. No third-party services.
- Supported formats: PNG, JPG, GIF, WebP. SVG is not supported.
```

---

## Distribution

Three channels, same npm package, different users.

### npm package (primary)

```
npx gh-imgup screenshot.png --pr 42      # zero-install, run directly
npm install -g gh-imgup                   # global install
```

Standard distribution for a Node.js CLI with zero runtime deps. Works everywhere Node 22+ is available: local dev, CI, agent sandboxes. The compiled JS is small — no bundler needed.

Pin versions in CI:

```
npx gh-imgup@1.0.0 screenshot.png --pr 42
```

### `gh` CLI extension

```
gh extension install <owner>/gh-imgup
gh imgup screenshot.png --pr 42
```

The repo includes a `gh-imgup` shell wrapper at the root (required by `gh extension install`):

```bash
#!/usr/bin/env bash
npx --yes gh-imgup "$@"
```

This gives the `gh imgup` subcommand UX. `gh` handles updates via `gh extension upgrade`.

### Agent skill

```
npx skills add <owner>/gh-imgup
```

Ships the `skills/gh-imgup/SKILL.md` alongside the CLI. Agents discover the tool and the pre-upload safety instructions together — the SKILL.md is the entry point, the CLI is the executable it references. Works with Claude Code, Cursor, Codex, and other skill-aware agents.

### Repo layout

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
├── dist/                 # Compiled JS (npm package entry)
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

All three channels point at the same compiled code. The skill directory and extension wrapper are just entry points for their respective ecosystems.

---

## Comparison

| Property | `gh-imgup` | `gh-image` | tonkotsuboy | `gitshot` |
|---|---|---|---|---|
| Auth | `GITHUB_TOKEN` / fine-grained PAT | Stolen browser cookie | Browser automation | `gh` CLI token |
| Min credential scope | `contents:write` + `issues:write` on one repo | Full GitHub account | Full browser (all sites) | `repo` scope |
| API | Documented REST | Undocumented internal | Undocumented (via browser) | Documented REST |
| Shell injection | Impossible | N/A (Go) | N/A (prompt) | Unquoted `execSync` |
| 3rd party data flow | None | None | None | catbox.moe fallback |
| Runtime deps | Zero | `kooky` + transitive | None (prompt) | Zero |
| Private repo images | Private (same-repo assets) | Private (`user-attachments`) | Private (`user-attachments`) | **Public** (separate repo) |
| Public repo image index | Browsable on releases page | No index (UUID) | No index (UUID) | Browsable on releases page |
| Upload integrity | SHA-256 verified | None | None | None |
| Token sanitization | All error paths | None | N/A | None |
| Agent image safety | Explicit pre-upload check | None | None | None |
| Deterministic behavior | Yes (compiled code) | Yes (compiled code) | No (AI interprets prompt) | Yes (compiled code) |

---

## Implementation

~400 lines of TypeScript across 7 files. Zero runtime dependencies. The entire audit surface:

- `index.ts` — CLI arg parsing, orchestration
- `auth.ts` — token resolution, scope warning, error sanitization
- `release.ts` — create-or-get release, upload asset, verify digest
- `github.ts` — comment on PR/issue
- `validate.ts` — repo format, tag prefix, issue number, file stat/MIME, remote URL parsing
- `cleanup.ts` — scan all issues/PRs for referenced assets, interactive deletion
- `upload.ts` — types, MIME allowlist, markdown/JSON formatters

---

## Design History

This tool was designed through adversarial iteration. Three existing tools were security-audited, a solution was proposed, that proposal underwent two rounds of security audit with all findings addressed, and the architecture was refined through each pass.

Key decisions and their rationale:

- **Same-repo release assets** — access controls inherited for free; no public exposure of private repo images
- **`fetch()` only for GitHub ops** — structurally eliminates shell injection rather than defending with escaping
- **Zero dependencies** — supply chain surface is the tool and Node built-ins, nothing else
- **No third-party fallback** — if credentials are missing, fail clearly; never ship data to a service the user didn't choose
- **No automated destructive cleanup** — safe cleanup is interactive; full deletion is manual; the release carries its own warning label
- **Pre-upload image review in agent skill** — the upload is secure, so the highest risk is what gets uploaded; that's where the safety control goes
- **SVG excluded** — active content format; screenshots are raster; available behind `--allow-svg` if needed
- **Tag prefix validation** (`_` required) — prevents `--tag v2.0.0` from polluting real releases
- **SHA-256 integrity check** — corrupted uploads detected and cleaned up, not silently accepted
- **`gh-imgup` not `gh-img`** — avoids confusion with `gh-image` (drogers0), one character away with the opposite security model
- **Prerelease not draft** — draft release assets 404 via tag lookup; prerelease is the only option that renders
- **No `--yes` on cleanup** — reference scan is inherently incomplete; always require human confirmation
