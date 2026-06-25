# Upload rejection delete binding

Branch `fix/upload-delete-binding`. Follow-up from the full project review: P2
found that `uploadAsset` verified a rejected upload's cleanup target by checking
that the re-fetched asset URL merely contained the per-upload hex suffix.

## Decisions

- Keep the existing re-fetch-before-delete shape; it is the right boundary
  between an accepted upload URL and an untrusted asset id.
- Strengthen the destructive check to require the exact accepted
  `browser_download_url` (was: merely contains the hex suffix).
- Bind on the URL ONLY, not the asset name. The accepted
  `browser_download_url` already encodes GitHub's stored (possibly sanitized)
  filename, so it is the response-bound value; comparing the re-fetched `name`
  to the name we *requested* would false-skip cleanup whenever GitHub renames
  the file (hidden/special-char basenames) — the AGENTS.md "hex suffix is the
  binding key, exact-name matching rejected" gotcha. An earlier revision added
  that name check; a Codex PR review (P2) caught it and it was removed.
- Keep warning-and-orphan behavior on any mismatch. Over-keeping is safer than
  deleting a live asset by an id that no longer binds to this upload.

## Refute-first review

- Confirmed the original issue before editing: a same-repo/tag URL with the same
  hex substring but a different filename was deleted.
- Rejected exact-name matching entirely (not just name-only): GitHub may
  sanitize filenames, and the accepted URL is the stronger response-bound value.
- Accepted exact URL equality for the re-fetch because a valid delete target is
  the same asset id still hosting the same URL the 201 response bound to the run.

## Verification

- `npm test` (149 tests; adds: only-shares-hex aborts, and GitHub-renamed
  asset still deletes on the same URL)
- `npm run typecheck`, `npm run build`
- `npm run format` clean
- `npm run lint` (passes with the pre-existing `github.ts` regex info)
