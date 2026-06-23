# Foundation modules: validators + formatters

First implementation increment of the staged full build (owner-confirmed
plan after a 10-agent readiness review): the two pure leaf modules with no
network/subprocess, so later stages import a tested base. Build order from
here: auth → release → github → wire index → cleanup → distribution.

## Decisions

- **`upload.ts` owns the MIME allowlist** (per the design's repo layout);
  `validate.ts` imports `mimeFor`. Extension is **lowercased before lookup**
  so `PHOTO.PNG` resolves — normalization, not the banned content sniffing.
- **`render()` is the single output entry point**, returns the full stdout
  payload incl. trailing newline; formatters are pure. `--json` is **always
  a JSON array**, one object per file even for one file (owner decision) —
  stable shape for pipe consumers. Object: `{url, markdown, filename, repo,
  digest}` (design.md's field set; README's single-object example gets
  updated in the index-wiring PR when output goes user-visible).
- **`parseGitRemoteUrl` rewritten vs the spec's own code**, which had two
  real bugs: `[^/.]+` truncated dotted names (`owner.github.io` →
  `owner.github`) — now strip a trailing `.git`/slash instead; and the host
  was unanchored (`evilgithub.com` matched) — now anchored to `//|@|^`.
- **`validateNumber` trims first** then keeps the strict `String(n)!==input`
  guard (tolerates a `$(...)` trailing newline; still rejects `42abc`).
- **`validateImageFile`**: exists → isFile → non-empty → size → MIME;
  `statSync` follows symlinks (natural CLI behavior); 0-byte and directories
  rejected. Stat-before-read so an oversized file isn't loaded to reject it.

## Deferred

- The other two owner decisions (multi-file partial-failure = fail-fast/leave
  uploads; `--cleanup` refuses on non-TTY) don't bite until the index/cleanup
  PRs — recorded but not yet coded.
- Repo inference subprocess (`execFileSync git`) — only the pure parser lands
  here; the git call comes with a later stage.

## Promote to AGENTS.md (follow-up)

The always-array `--json` shape and the non-TTY-refuse rule are project
invariants worth adding to "Conventions & gotchas" once their code lands.
