---
name: gh-imgup
description: >-
  Upload images you already have (screenshots, before/after UI pairs, diagrams)
  to a GitHub issue or pull request and get back a Markdown/raw/JSON link that
  renders inline for human reviewers. Use when you have an image in hand to
  publish or attach to a PR/issue. Capturing it well (deciding what to shoot,
  getting a clean before/after pair) is a separate upstream step; use a
  screenshot/capture workflow skill for that if you have one. Uploads via the
  documented Release Assets API: no browser, no cookies, no third-party hosts.
  ALWAYS review each image for secrets before uploading.
---

# gh-imgup

Attach images to GitHub issues and PRs from the terminal. Each image is uploaded
as an asset on a dedicated prerelease (`_gh-imgup`) on the **same repository**,
then returned as Markdown/raw/JSON for the caller to embed. The URL renders
inline in GitHub Markdown, exactly like a drag-and-drop upload, but is fully
scriptable. Use this when you already have the image to attach; capturing a
clean, comparable pair is a separate concern (a screenshot/capture workflow
skill, if you use one).

## MANDATORY: review every image before uploading

**This is the single most important step, and it is not optional.** The upload
mechanism is secure; the risk is *what gets uploaded*. An uploaded image is
public on a public repo (anyone can browse the release) and visible to every
collaborator on a private one, and it persists until explicitly deleted.

Before running the tool, **open and visually inspect each image** for:

- API keys, tokens, passwords, session cookies, `.env` contents
- Internal hostnames, IPs, private URLs, infrastructure details
- Customer or personal data (PII), real names, emails, account numbers
- Anything in a terminal, editor, browser devtools, or notification that
  wasn't meant to be shared

If an image contains any of the above, **do not upload it.** Stop and tell the
user exactly what you found and where, and ask them to crop/redact or pick a
different image. Never upload "just to be safe"; there is no un-publish.

When in doubt, ask the user before uploading.

## Usage

```bash
npx -y @freeasinbird/gh-imgup <file...> [options]
```

Run it zero-install with `npx -y` (Node 22+). Keep the `-y` (so npx's first-run
prompt can't hang a non-interactive agent) and the `@freeasinbird/` scope (a
bare `npx gh-imgup` is a different package). For repeat use, or for an agent
whose approval reviewer won't run unpinned downloaded code (Codex), install a
pinned version once and run the bare `gh-imgup`:
`npm i -g @freeasinbird/gh-imgup@X.Y.Z` (or the `gh` extension as `gh imgup`);
the flags are identical.

To skip the per-run approval prompt, pre-authorize the command once (full
details for Claude and Codex are in the README's "Pre-authorize for agents"):
Claude Code allowlists `Bash(gh-imgup *)` (or
`Bash(npx -y @freeasinbird/gh-imgup *)` for the npx form); Codex approves the
persistent prefix `["gh-imgup"]` after a pinned install.

The tool resolves the target repo from `--repo` or the git `origin` remote,
resolves a token from `GITHUB_TOKEN` (or the `gh` CLI), uploads each file,
verifies its SHA-256, and prints the result.

When creating or editing a PR/issue body, prefer running without `--pr`/`--issue`
and inserting the stdout Markdown into that body. Use `--pr`/`--issue` only for a
follow-up comment: when the user asks for one, when the thread already exists and
editing the body is out of scope, or when a CI job adds evidence after the
PR/issue is open.

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

`stdout` carries only machine-parseable output (the Markdown, raw URL(s), or
JSON); progress, warnings, and errors go to `stderr`. Exit code is `0` only when
every upload succeeded. For body composition, capture the default Markdown from
stdout; for scripting, capture a link with
`URL=$(npx -y @freeasinbird/gh-imgup shot.png --raw)` and rely on the exit code.

## Auth

Set `GITHUB_TOKEN` to a token with `contents:write` (add `issues:write` for
`--pr`/`--issue`); a short-lived, single-repo fine-grained PAT minimizes blast
radius. With no `GITHUB_TOKEN`, the tool falls back to the `gh` CLI token
(broader scope; it warns when it does). Missing or invalid credentials fail
loudly; the tool never falls back to a third-party host. The token is stripped
from every error message before it reaches stderr, CI logs, or your context.

## When NOT to use it

- The image hasn't been reviewed for secrets (see above): review first.
- The user only wants a local file referenced, not published: don't upload.
- A non-image artifact (logs, code): paste those as text instead.
