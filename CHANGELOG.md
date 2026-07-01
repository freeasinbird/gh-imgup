# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.3] - 2026-07-01

### Fixed

- Named HTML-entity decoding no longer resolves `Object.prototype` names
  (`&toString;`, `&constructor;`, and similar) into JavaScript function source.
  GitHub renders those literally, so the comment token guard and `--cleanup`
  reference matching now match GitHub's actual rendering. The old behavior was
  fail-safe (it could only over-keep assets, never leak a token), but the
  decoding was wrong.
- The error-body credential scan is bounded: redaction now decodes at most the
  first 8 KiB of a response body (which strictly contains everything the error
  message can echo), removing a quadratic worst case on oversized tampered
  responses. Detection within the echoed region is unchanged.
- Packing and publishing from a Windows checkout: build hygiene scripts use a
  Node one-liner instead of `rm -rf`, and `test`/`prepack` now clean `dist/`
  first so stale compiled files can't run in tests or ship in the tarball.

### Changed

- Internal: the duplicated security helpers were unified behind single
  implementations (control-character collapsing, the token-in-tag refusal, and
  a shared response-URL binding core), verified behavior-preserving. SECURITY.md
  now documents that file arguments follow symlinks deliberately.

## [0.1.2] - 2026-06-26

### Changed

- `--help` now lists the full pre-upload review checklist (credentials,
  internal hostnames/IPs/infrastructure, customer data/PII, and anything not
  meant to be shared) instead of a one-line "review for secrets". The CLI is
  the only review guidance bundled in the npm package, so the complete surface
  now ships with the tool for agents/users who don't load the skill.
- Skill (`skills/gh-imgup/SKILL.md`) trigger narrowed to "you already have the
  image to attach," delineating it from an upstream screenshot/capture workflow
  so the two don't both fire on a visual change.

## [0.1.1] - 2026-06-26

### Changed

- Documentation only — no code changes. README restructured to front-load a
  Quick Start, flipped from pre-release to published, with npm/CI badges and a
  dedicated Versioning section.

## [0.1.0] - 2026-06-26

First public release on npm as `@freeasinbird/gh-imgup`.

### Added

- **Image upload via the Release Assets API.** `gh-imgup <file...>` uploads one
  or more images as assets on a dedicated prerelease (`_gh-imgup`) on the same
  repository, and prints a link that renders inline in GitHub Markdown.
- **PR/issue comments.** `--pr <n>` / `--issue <n>` post a comment embedding the
  uploaded image(s); `-m/--message` adds a caption to that comment. Passing
  `-m/--message` without `--pr`/`--issue` warns on stderr that it is ignored (it
  only captions a posted comment); the upload still succeeds.
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

[Unreleased]: https://github.com/freeasinbird/gh-imgup/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/freeasinbird/gh-imgup/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/freeasinbird/gh-imgup/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/freeasinbird/gh-imgup/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/freeasinbird/gh-imgup/releases/tag/v0.1.0
