# Security Policy

`gh-imgup` is a security-first tool: it exists because the alternatives for
attaching images to GitHub issues/PRs trade away credential scope, supply-chain
safety, or both. Security is the project's reason to exist, so reports are taken
seriously.

## Reporting a vulnerability

**Please do not disclose a security vulnerability in a public issue, PR, or
discussion.**

Use GitHub's private vulnerability reporting: on the repository, open the
**Security** tab → **Report a vulnerability** (this creates a private advisory
visible only to maintainers). Include:

- A description of the issue and its impact.
- Steps to reproduce, or a proof of concept.
- The version/commit, your OS, and your Node.js version.

If that option isn't visible (private reporting must be enabled on the repo),
open a regular issue that says only "security report — please enable private
reporting" with **no vulnerability details**, and a maintainer will open a
private channel to receive them.

You'll get an initial acknowledgement, and we'll work with you on a fix and
coordinated disclosure. There is no bounty program; credit is given in the
advisory unless you prefer otherwise.

## Supported versions

The project is pre-1.0 and changes quickly. Only the latest release (and `main`)
receives security fixes. Pin a version in CI and update deliberately.

## Security model

These guarantees define the tool; a change that breaks one is a security
regression, not a style choice. The authoritative list (with enforcement notes)
is in [AGENTS.md](AGENTS.md#architecture-invariants); the threat model and design
rationale are in [`docs/design.md`](docs/design.md).

- **No shell for GitHub operations.** All GitHub API access is `fetch()`-only.
  The compiled CLI makes exactly two subprocess calls ever — `gh auth token` and
  `git remote get-url origin` — both with array arguments (no shell), no user
  input interpolated, guarded by a timeout. This eliminates shell injection
  structurally rather than defending against it with escaping. (The `gh`
  extension wrapper is a thin bootstrap shell script that locates/builds `dist/`
  and forwards arguments to `node`; it interpolates no user input into a shell.)
- **Zero runtime dependencies.** The published artifact uses only Node.js
  built-ins and global `fetch`; `package.json` declares no runtime
  `dependencies`. The supply-chain audit surface is the tool's own source plus
  Node.
- **The token never leaks.** It is stripped from output before anything reaches
  stderr, CI logs, or an agent's context: the literal token always, plus percent-
  and `\u`-escaped forms, which are detected and redacted as a whole message.
  Response-derived values (asset names, API error bodies) additionally collapse
  control characters, and the public comment surface refuses to post a body in
  which the token appears in any rendered form — HTML entities and backslash
  escapes included.
- **No third-party network destinations.** Requests go only to
  `api.github.com` and `uploads.github.com`, over HTTPS, with client redirects
  refused. There is no fallback host; missing or invalid credentials fail loudly.
- **Strict MIME allowlist.** Only `.png`, `.jpg`, `.jpeg`, `.gif`, and `.webp`
  are accepted, mapped to fixed MIME types — no content sniffing, no
  `application/octet-stream` fallback. SVG is excluded as an active-content
  format.
- **Upload integrity is verified.** The local SHA-256 is compared against the
  API's reported digest; on mismatch the asset is deleted and the run fails.
- **Machine-only stdout.** Only the Markdown/raw/JSON result is written to
  stdout, and only when every upload succeeded; all human-facing text goes to
  stderr.

## Operational guidance

- **Scope the token.** Use a short-lived, single-repository fine-grained PAT
  with `contents:write` (add `issues:write` only if you comment via
  `--pr`/`--issue`). GitHub has no `releases:write`-only scope, so
  `contents:write` also permits pushing commits — keep blast radius small.
- **Review images before uploading.** The upload is secure; the risk is *what*
  you upload. An asset is public on a public repo and persists until deleted.
  Inspect every image for secrets, internal URLs, and PII first. In agent
  workflows this pre-upload review is a hard step in
  [`skills/gh-imgup/SKILL.md`](skills/gh-imgup/SKILL.md).
- **Clean up deliberately.** `gh-imgup --cleanup` interactively removes
  unreferenced assets (it asks first and refuses without a TTY). To remove a
  specific asset by hand, use `gh release delete-asset <tag> <asset-name>`.
  Deleting the *whole* release (`gh release delete`) is intentionally never
  automated — it breaks every still-embedded image.
