import { statSync } from "node:fs";
import { basename } from "node:path";
import { MIME, mimeFor } from "./upload.js";

/** A validated repository identity. */
export interface Repo {
  owner: string;
  name: string;
}

/** Parse and validate an `owner/repo` string. Rejects empty/`.`/`..` components. */
export function validateRepo(input: string): Repo {
  const match = input.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  const owner = match?.[1];
  const name = match?.[2];
  if (owner === undefined || name === undefined) {
    throw new Error(`Invalid repo: "${input}". Expected: owner/repo`);
  }
  if (owner === "." || owner === ".." || name === "." || name === "..") {
    throw new Error(`Invalid repo component: "${input}"`);
  }
  return { owner, name };
}

/**
 * Validate a release tag. Must start with `_` so a stray `--tag v2.0.0` cannot
 * collide with real release tags, and stay within a URL-path-safe charset (the
 * tag is interpolated into API paths and the browser_download_url).
 */
export function validateTag(tag: string): string {
  if (!tag.startsWith("_")) {
    throw new Error(
      `Tag "${tag}" rejected: must start with "_" to avoid colliding with real release tags.\n` +
        "Default: _gh-imgup",
    );
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(tag)) {
    throw new Error(`Tag "${tag}" contains invalid characters.`);
  }
  return tag;
}

/**
 * Validate a positive integer issue/PR number. The `String(n) !== input` guard
 * rejects partial parses like `42abc`; input is trimmed first so a trailing
 * newline from shell substitution (`--pr $(...)`) doesn't surprise the user.
 */
export function validateNumber(input: string): number {
  const trimmed = input.trim();
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(n) || n <= 0 || String(n) !== trimmed) {
    throw new Error(`Invalid issue/PR number: "${input}"`);
  }
  return n;
}

/** Validate `--max-size`, returning a positive number of megabytes (fractions allowed). */
export function validateMaxSize(input: string): number {
  const mb = Number(input.trim());
  if (!Number.isFinite(mb) || mb <= 0) {
    throw new Error(
      `Invalid --max-size: "${input}". Expected a positive number of MB.`,
    );
  }
  return mb;
}

/** Network transports a GitHub remote can legitimately use. */
const GIT_REMOTE_SCHEMES = new Set(["https:", "http:", "ssh:", "git:"]);

/**
 * Parse an `owner/repo` out of a git remote URL. Handles HTTPS/`ssh://`/`git://`
 * URLs and scp-style SSH (`git@github.com:o/r`), strips a trailing `.git`/slash,
 * and preserves dotted names (`owner.github.io`). The host is extracted
 * *structurally* — via the URL parser, or the scp `[user@]host:path` grammar —
 * and must equal `github.com` exactly, so spoofs like `evilgithub.com`,
 * `github.com.evil.com`, or a path-embedded `…@github.com/o/r` are rejected.
 * The URL scheme is also allowlisted to real git transports, so a non-git
 * remote whose host happens to be github.com (`file://github.com/o/r`,
 * `ftp://github.com/o/r.git`) is rejected too. Only real github.com remotes are
 * accepted; anything else fails loudly so the caller passes --repo rather than
 * uploading to an inferred wrong repo.
 */
export function parseGitRemoteUrl(remote: string): Repo {
  const trimmed = remote.trim();
  const unparseable = () =>
    new Error(
      `Could not parse GitHub repo from remote: ${remote}\n` +
        "Only github.com remotes are supported. Pass --repo owner/repo explicitly.",
    );

  let host: string;
  let path: string;
  // scp-like syntax has no scheme and a host:path separator, e.g.
  // `git@github.com:owner/repo` — the host is the segment before the first ":",
  // after stripping an optional `user@` (which cannot contain "@" or "/").
  const scp = trimmed.match(/^(?:[^@/]+@)?([^/:]+):(.+)$/);
  if (!trimmed.includes("://") && scp) {
    host = scp[1] ?? "";
    path = scp[2] ?? "";
  } else {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw unparseable();
    }
    if (!GIT_REMOTE_SCHEMES.has(url.protocol)) {
      throw unparseable();
    }
    host = url.hostname;
    path = url.pathname.replace(/^\/+/, "");
  }

  if (host !== "github.com") {
    throw unparseable();
  }
  const parts = path.match(/^([^/]+)\/(.+?)(?:\.git)?\/?$/);
  if (!parts) {
    throw unparseable();
  }
  return validateRepo(`${parts[1]}/${parts[2]}`);
}

/** A validated, uploadable image file and its resolved metadata. */
export interface ImageFile {
  filepath: string;
  /** basename of the file, used as the asset name source. */
  filename: string;
  /** Allowlisted MIME type. */
  mime: string;
  /** Size in bytes (from stat, before reading). */
  size: number;
}

function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/**
 * Validate an image file by stat (no read): exists → is a regular file →
 * non-empty → within the size limit → allowlisted MIME. Statting before reading
 * means an oversized file is rejected without loading it into memory.
 */
export function validateImageFile(
  filepath: string,
  maxBytes: number,
): ImageFile {
  let size: number;
  let isFile: boolean;
  try {
    const stats = statSync(filepath);
    size = stats.size;
    isFile = stats.isFile();
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(`File not found: ${filepath}`);
    }
    throw new Error(`Cannot read file ${filepath}: ${code ?? "unknown error"}`);
  }

  if (!isFile) {
    throw new Error(`Not a regular file: ${filepath}`);
  }
  if (size === 0) {
    throw new Error(`File is empty: ${filepath}`);
  }
  if (size > maxBytes) {
    throw new Error(
      `File ${filepath} is ${megabytes(size)}MB, exceeds limit ${megabytes(maxBytes)}MB`,
    );
  }

  const filename = basename(filepath);
  const mime = mimeFor(filename);
  if (!mime) {
    throw new Error(
      `Unsupported file type: ${filename}. Allowed: ${Object.keys(MIME).join(", ")}`,
    );
  }

  return { filepath, filename, mime, size };
}
