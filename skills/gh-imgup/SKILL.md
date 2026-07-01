---
name: gh-imgup
description: >-
  Upload images you already have (screenshots, before/after UI pairs, diagrams)
  to a GitHub issue or pull request and get back a Markdown/raw/JSON link that
  renders inline for human reviewers. Use when you have an image in hand to
  publish or attach to a PR/issue. Capturing it well — deciding what to shoot
  and getting a clean before/after pair — is a separate upstream step; use a
  screenshot/capture workflow skill for that if you have one. Uploads via the
  documented Release Assets API — no browser, no cookies, no third-party hosts.
  ALWAYS review each image for secrets before uploading.
---

# gh-imgup

Attach images to GitHub issues and PRs from the terminal. The image is uploaded
as an asset on a dedicated prerelease (`_gh-imgup`) on the **same repository**,
then returned as Markdown/raw/JSON for the caller to embed. The returned URL
renders inline in GitHub Markdown, exactly like a drag-and-drop upload, but is
fully scriptable.

Use this when you already have the image to attach — a screenshot, a rendered
diagram, or a before/after pair. Getting a clean, comparable pair is a separate
capture concern (a screenshot/capture workflow skill, if you use one); this
skill owns getting the bytes onto the PR/issue safely.

## MANDATORY: review every image before uploading

**This is the single most important step, and it is not optional.** The upload
mechanism is secure; the risk is *what gets uploaded*. An uploaded image is
public on a public repo (anyone can browse the release) and visible to every
collaborator on a private one — and it persists until explicitly deleted.

Before running the tool, **open and visually inspect each image** for:

- API keys, tokens, passwords, session cookies, `.env` contents
- Internal hostnames, IPs, private URLs, infrastructure details
- Customer or personal data (PII), real names, emails, account numbers
- Anything in a terminal, editor, browser devtools, or notification that
  wasn't meant to be shared

If an image contains any of the above, **do not upload it.** Stop and tell the
user exactly what you found and where, and ask them to crop/redact or pick a
different image. Never upload "just to be safe" — there is no un-publish.

When in doubt, ask the user before uploading.

## Usage

```bash
npx -y @freeasinbird/gh-imgup <file...> [options]
```

Invoke it zero-install with `npx` (needs Node 22+). The `-y` is load-bearing:
without it, npx's first-run `Ok to proceed?` prompt hangs a non-interactive
agent — always run `npx -y @freeasinbird/gh-imgup …`. Use the **scoped** name;
a bare `npx gh-imgup` resolves to a different package on the registry, not this
one.

For repeat use — or any agent whose approval reviewer refuses to run unpinned
downloaded code (Codex) — prefer a **pinned** pre-install and run the bare
`gh-imgup`: `npm i -g @freeasinbird/gh-imgup@X.Y.Z` (or the `gh` extension as
`gh imgup`); the flags are identical. If the CLI is already on PATH, use it
instead of npx.

If your agent still prompts for approval before each run, pre-authorize the
command once — see "Pre-authorize for agents" in the README. Claude Code:
`Bash(gh-imgup *)` (pinned binary) or `Bash(npx -y @freeasinbird/gh-imgup *)`
(zero-install). Codex: install pinned, then approve the persistent prefix
`["gh-imgup"]` (it won't auto-run npx).

The tool resolves the target repo from the `--repo` flag or the git `origin`
remote, resolves a token from `GITHUB_TOKEN` (or the `gh` CLI), uploads each
file, verifies its SHA-256, and prints a result.

When you are creating or editing a PR/issue body, prefer running without
`--pr`/`--issue` and incorporating the Markdown printed to stdout into that
body. Use `--pr`/`--issue` only when the user asks for a follow-up comment, the
thread already exists and body editing is out of scope, or a CI job is adding
evidence after the PR/issue has been opened.

Common invocations:

```bash
# Preferred agent flow: upload and use stdout in the PR/issue body
npx -y @freeasinbird/gh-imgup before.png after.png --repo owner/repo

# Follow-up comment on an existing PR/issue
npx -y @freeasinbird/gh-imgup before.png after.png --pr 42 -m "Before / after: nav redesign"
npx -y @freeasinbird/gh-imgup repro.png --issue 17

# Machine-friendly forms
npx -y @freeasinbird/gh-imgup chart.png --raw
npx -y @freeasinbird/gh-imgup chart.png --json
```

### Options

| Option | Meaning |
| --- | --- |
| `--repo <owner/repo>` | Target repo (default: inferred from git `origin`) |
| `--pr <n>` / `--issue <n>` | Post a follow-up comment embedding the image(s) on that PR/issue |
| `-m, --message <text>` | Caption included in the posted comment |
| `--json` / `--raw` | Machine output: JSON, or bare URL(s) (default: Markdown) |
| `--tag <name>` | Release tag (default `_gh-imgup`; must start with `_`) |
| `--max-size <MB>` | Max file size (default 25) |
| `--cleanup` | Interactively delete unreferenced assets (asks first; needs a TTY) |
| `-h, --help` / `-v, --version` | Help / version |

Allowed image types: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`. SVG is rejected
(active-content format).

### Output contract

`stdout` is machine-parseable only — the Markdown, raw URL(s), or JSON. All
progress, warnings, and errors go to `stderr`. Exit code is `0` only when every
upload succeeded. For PR/issue body composition, capture the default Markdown
stdout and insert it into the body. For scripting, capture the link with
`URL=$(npx -y @freeasinbird/gh-imgup shot.png --raw)` and rely on the exit code; read `stderr` for
what happened.

## Auth

Set `GITHUB_TOKEN` to a token with `contents:write` (add `issues:write` for
`--pr`/`--issue`). A short-lived, single-repo fine-grained PAT minimizes blast
radius. If no `GITHUB_TOKEN` is set, the tool falls back to the `gh` CLI token
(broader scope — it warns when it does). Missing/invalid credentials fail
loudly; the tool never falls back to a third-party host.

The token is stripped from every error message before it reaches stderr, CI
logs, or your context.

## When NOT to use it

- The image hasn't been reviewed for secrets (see above) — review first.
- The user only wants a local file referenced, not published — don't upload.
- A non-image artifact (logs, code) — paste those as text instead.
