# parseGitRemoteUrl: structural host extraction

Correction to [2026-06-23-1653]'s claim that the remote host is "anchored
to `//|@|^`". A Codex review on PR #4 found that boundary still too loose:
treating `@` as a host boundary *anywhere* means a non-github remote whose
path contains `…@github.com/o/r` (e.g. `https://example.com/foo@github.com/o/r.git`
or `git@evil.com:foo@github.com/o/r.git`) matches and infers `o/r` — so the
tool would upload to the wrong *real* github.com repo instead of failing.
That violates invariant 4 (github.com only; fail loud).

## Decision

- Extract the host **structurally** instead of substring-matching: parse
  scheme URLs with `new URL()` and read `.hostname`; parse scp syntax
  (`[user@]host:path`) with a grammar where userinfo can't contain `@`/`/`,
  so the host is unambiguously the segment before the first `:`. Require
  `host === "github.com"` exactly. Zero-dep (Node's `URL` global).
- Rejected: layering more anchors onto the single regex — the `@`-anywhere
  failure shows a flat regex can't reliably separate host from path/userinfo.

Added two regression tests for the path-embedded `@github.com` spoofs.
