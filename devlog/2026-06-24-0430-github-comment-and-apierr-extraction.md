# github.ts comment posting + shared apierr.ts extraction

Build stage 4 (PR #7 branch `feat/pr-issue-comment`), on top of the merged
release pipeline.

## Decisions

- **Extracted apierr.ts** (apiError, decodesToToken, redactField, redactBody,
  MAX_DETAIL) out of release.ts. github.ts needs the same sanitized-API-error +
  decode-aware token redaction, and cleanup.ts will too — three consumers of
  security-critical leak defenses that must not drift. Behavior-preserving move
  (release tests unchanged), its own commit.
- **github.ts `postComment`** — PRs and issues share `/issues/{n}/comments`, so
  one function; the caller maps `--pr`/`--issue` to the number. A comment is a
  PUBLIC surface (worst leak site), so it **refuses to post a body containing
  the token** in any encoded form, and validates the returned `html_url` is a
  printable-ASCII, canonical, token-free github.com URL (fragment allowed)
  before echoing. A 201 with an unusable URL still succeeded → warn, not fail.
- **API host + repoPath duplicated** (2 trivial lines) in github.ts rather than
  shared — not security-critical, and rule-of-three says consolidate when
  cleanup.ts becomes the 3rd use, not now.

## Proactive sweep (5 lenses, each finding verified)

Two confirmed, both fixed before commit:
- usableCommentUrl had dropped isUsableAssetUrl's printable-ASCII screen and
  `url.href === value` canonical check → control chars in a tampered `#fragment`
  (log forging) and non-canonical URLs (`/../`, mixed-case host) were reported.
- apiError echoed control chars from a tampered body/statusText (log forging) —
  pre-existing in release's path; fixed in the shared module (collapseControls,
  like escapeAltText) for all consumers.

Review follow-ups (all folded into their commits): DEL/C1 added to the
control-char strip; usableCommentUrl now binds the returned URL to the target
(`/{owner}/{repo}/(issues|pull)/{number}#issuecomment-<id>`), not just any
github.com URL; and the public-surface body check decodes HTML/Markdown
character refs (`&#95;`, `&#x5F;`, `&lowbar;` → `_`) — GitHub renders those, so
percent/`\u` don't leak in a comment but entities do.

Decided (wontfix): token split by Markdown/HTML FORMATTING (`ghp<b>_</b>TOK`,
`ghp**_**TOK`) renders as the token but is NOT covered. Detecting it reliably
means reimplementing GitHub's renderer (unbounded markup, zero-dep infeasible,
never complete), and the threat has no realistic actor: the caption author must
already hold the token to put its chars in the body, so they can leak it
regardless; an accident is literal (already caught). The refuse-token-body check
is a best-effort safety net for ACCIDENTAL LITERAL inclusion — the bounded,
complete decoders (percent/`\u`/entity/backslash) are cheap belt-and-suspenders;
the line is drawn at renderer reimplementation.

Gremlin watch: the control-char regex had to be written via a node script — the editor JSON layer decodes backslash-u escapes into literal control bytes.

## To promote to AGENTS.md (accumulating, do in the docs cleanup PR)

- New module **apierr.ts** as the single home for API-error/token-leak defenses.
- Invariant 3: generalize to "no credential leak" — literal **and** encoded
  (`%XX`, `\uXXXX`) forms, and strip control chars (C0, DEL,
  C1, line/para separators) from echoed API detail.
- A comment/tag/asset-name body is a public surface: refuse a token in it. The
  body check is an ACCIDENTAL-LITERAL safety net (not an exfil boundary — the
  caption author holds the token regardless); it applies bounded decoders
  (percent/`\u`/HTML entities incl. padded refs/`\_` backslash) but deliberately
  does NOT reimplement Markdown rendering (formatting-split is wontfix).
- Bind every reported response URL to the target (repo + path + id), not just
  the host — the comment-URL analog of release's asset-URL binding.

## Deferred (unchanged)

- Content-fingerprint binding (same-length-swap) → index.ts, next stage.
