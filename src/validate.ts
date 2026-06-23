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

/**
 * Parse an `owner/repo` out of a git remote URL. Handles HTTPS, scp-style SSH
 * (`git@github.com:o/r`), and `ssh://` forms, strips a trailing `.git`/slash,
 * and preserves dotted names (`owner.github.io`). The host is anchored to a
 * boundary (`//`, `@`, or start) so `evilgithub.com` and path-embedded
 * `github.com` segments don't match — only real github.com remotes are accepted.
 */
export function parseGitRemoteUrl(remote: string): Repo {
  const match = remote
    .trim()
    .match(/(?:^|@|\/\/)github\.com[/:]([^/]+)\/(.+?)(?:\.git)?\/?$/);
  if (!match) {
    throw new Error(
      `Could not parse GitHub repo from remote: ${remote}\n` +
        "Only github.com remotes are supported. Pass --repo owner/repo explicitly.",
    );
  }
  return validateRepo(`${match[1]}/${match[2]}`);
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
