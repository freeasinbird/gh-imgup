# Treat posted captions as plain text

PR #103 exposed a conflict between the proposed Markdown-escaping invariant
and the existing `-m/--message` path, which concatenated the caption directly
into a GitHub-rendered comment. Issue #72 names captions as user-controlled text
that must be escaped, while every user-facing surface describes `--message` as
a caption rather than a Markdown body.

## Decision

Treat captions as plain text. `escapeMarkdownText` collapses controls and
backslash-escapes every ASCII punctuation character before comment composition.
This preserves the rendered caption text while preventing links, images, raw
HTML, and punctuation-driven block syntax from becoming active. Keep
`markdownLine` focused on the image reference; each future interpolated field
must use an escaper for its own Markdown context.

Rejected treating `--message` as trusted Markdown because that would contradict
issue #72 and leave the option's trust contract implicit. If formatted captions
become useful, add a separate explicit interface with its trust implications
documented instead of weakening the plain-text path.

## Refute-first verification

- Confirmed and fixed: the existing caption path bypassed the proposed
  invariant by concatenating `args.message` directly into the comment body.
- Rejected by exhaustive test: no ASCII Markdown punctuation remains unescaped;
  the test covers every punctuation code point from `!` through `~`, rather than
  only the known image/link payload.
- Rejected by composition test: escaping `_` in a token does not hide it from
  the public-comment token guard, which normalizes the backslash escape before
  checking.
- Rejected against GitHub's `/markdown` renderer: an escaped caption containing
  image syntax and a raw HTML tag rendered as literal text, with no link, image,
  or HTML element in the returned fragment.
- Accepted by decision: newlines and other controls collapse to spaces because
  `--message` is a short caption, not a Markdown or multiline body.

Revisit when a concrete use case justifies an explicit formatted-caption
interface.
