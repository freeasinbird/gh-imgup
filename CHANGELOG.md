# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing is published to npm yet; everything below is the current state on `main`.

### Added

- **Image upload via the Release Assets API.** `gh-imgup <file...>` uploads one
  or more images as assets on a dedicated prerelease (`_gh-imgup`) on the same
  repository, and prints a link that renders inline in GitHub Markdown.
- **PR/issue comments.** `--pr <n>` / `--issue <n>` post a comment embedding the
  uploaded image(s); `-m/--message` adds a caption.
- **Output formats.** Markdown (default), `--raw` (bare URL[s]), and `--json`.
  stdout is machine-parseable only and written only on full success; all
  human-facing progress, warnings, and errors go to stderr.
- **Repo and token resolution.** Target repo from `--repo` or the git `origin`
  remote; token from `GITHUB_TOKEN`, falling back to the `gh` CLI (with a
  broad-scope warning when it does).
- **Validation.** Repo, issue/PR number, release tag (`_`-prefixed), file
  existence/size (`--max-size`, default 25 MB), and a strict image MIME
  allowlist (`.png/.jpg/.jpeg/.gif/.webp`).
- **`--cleanup`.** Interactively deletes release assets that no scanned
  issue/PR body or comment references. It always confirms first, refuses to run
  without a TTY, and keeps any asset it can't conclusively match.
- **Distribution channels.** Published as an npm package, a `gh` CLI extension
  (`gh imgup …` via the root `gh-imgup` wrapper), and an agent skill
  (`skills/gh-imgup/SKILL.md`) — all running the same compiled `dist/`.

### Security

- **`fetch()`-only GitHub access.** The compiled CLI makes exactly two subprocess
  calls (`gh auth token`, `git remote get-url origin`), both with array arguments
  and no interpolated input — shell injection is structurally impossible. (The
  `gh`-extension wrapper is a thin bootstrap shell script that builds/locates
  `dist/` and forwards arguments to `node`.)
- **Zero runtime dependencies.** Node.js built-ins and global `fetch` only.
- **Token never leaks.** Error output redacts the token in literal, percent-, and
  `\u`-encoded forms; response-derived fields (asset names, API error bodies) also
  collapse control characters, and the public comment guard refuses any body in
  which the token appears in a rendered form (HTML entities / backslash escapes).
- **No third-party destinations.** Requests go only to `api.github.com` and
  `uploads.github.com` over HTTPS, with client redirects refused; there is no
  fallback host.
- **Upload integrity.** The local SHA-256 is verified against the API digest and
  bound to the validated file contents; on mismatch the asset is deleted and the
  run fails.
- **Agent image safety.** The skill makes pre-upload image review (for secrets,
  internal URLs, and PII) a mandatory step — the highest-impact control, since
  the upload is secure but the risk is what gets uploaded.

[Unreleased]: https://github.com/freeasinbird/gh-imgup/commits/main
