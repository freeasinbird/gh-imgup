# Document the native GitHub CLI attachment path

README.md and docs/design.md said GitHub has no programmatic image-attachment
path and that browser-cookie or Release Assets uploads are the only
alternatives. The PR #124 review raised this, and issue #125 tracks it. That
premise is outdated: GitHub now documents `--attach PATH` on `gh issue
create|edit|comment` and `gh pr create|edit|comment`.

## Decision

- **Describe the native path factually, as a documented alternative.** Chose
  a neutral description (commands, push-access requirement, body rewrite by
  gh, access following repository visibility, anonymized `user-attachments`
  URL with no public index, supported types including SVG and video, 10 MB
  image limit) over leaving the history as is. The old text was a false
  claim in shipped docs.
- **Keep the Release Assets design unchanged in this work unit.** Recommending
  the native path over `gh-imgup`, or the reverse, was rejected. That is
  product direction, tracked separately (issue #139 names #100), and this
  audit must not decide it.
- **Assert only what the cited sources state.** The docs say nothing about the
  gh version that added `--attach`, the token types, scopes, or endpoint it
  uses, GitHub Enterprise Server support, or whether `user-attachments` can be
  deleted or expire. The earlier "GitHub-managed and eventually cleaned up"
  wording had no primary source, so it now states only that access follows
  repository visibility and that the attachment docs don't describe deletion
  or expiry. The design comparison table says "not documented" where the
  evidence is silent, instead of "None".
- **Keep cli/cli#1895 as history.** It was opened 2020-09-22 and closed
  2020-11-24 as `not_planned` (labels `blocked`, `platform`). A maintainer
  comment pinned on 2026-06-12 points to cli/cli#13256 as the open issue
  tracking feedback on attachment support, so both files now cite #13256
  wherever they cite #1895.

## Evidence

- <https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli>:
  the six commands, push access, upload and body rewrite (in-place for a
  matching local-path reference, appended otherwise), repeatable flag with no
  duplicate file, `#` alt-text suffix that defaults to the file name and
  doesn't apply to video, and image and media files only.
- <https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files>:
  unauthenticated access on public repositories, repository-access-only on
  private and internal ones, anonymized URL, PNG/GIF/JPEG/SVG and video types,
  and the 10 MB limit for images and GIFs.
- The GitHub API record of cli/cli#1895 (dates, state reason, labels, and the
  pinned comment).
- The gh CLI source on `trunk`, as confirmation only: `--attach` is wired on
  `issue create`, `pr create`, and `pr comment`, with help text giving a limit
  of 50 files and saying it doesn't work with `--web`. The docs pages are the
  citations.

## Left Unchanged

- `SECURITY.md` line 3 repeats the outdated premise ("the alternatives ...
  trade away credential scope, supply-chain safety, or both"). It is outside
  this work unit's paths and belongs in a follow-up issue.
- `docs/agent-workflow.md` already mentions `--attach`. It is a managed file
  and stays as it is.

Revisit when: cli/cli#13256 resolves, GitHub documents a REST attachment API or
the `user-attachments` lifecycle, or the product-direction issue decides how
`gh-imgup` should be positioned against the native path.
