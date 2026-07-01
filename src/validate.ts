import { createHash } from "node:crypto";
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { basename } from "node:path";
import { sanitize } from "./auth.js";
import { MIME, mimeFor } from "./upload.js";

/** A validated repository identity. */
export interface Repo {
  owner: string;
  name: string;
}

/** Components that are syntactically `[A-Za-z0-9_.-]+` but never a real repo. */
const BAD_REPO_COMPONENTS = new Set([".", "..", ".git"]);

/** Parse and validate an `owner/repo` string. Rejects empty/`.`/`..`/`.git` components. */
export function validateRepo(input: string): Repo {
  const match = input.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  const owner = match?.[1];
  const name = match?.[2];
  if (owner === undefined || name === undefined) {
    throw new Error(`Invalid repo: "${input}". Expected: owner/repo`);
  }
  if (BAD_REPO_COMPONENTS.has(owner) || BAD_REPO_COMPONENTS.has(name)) {
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
 * Refuse a --tag that contains the resolved token. The tag goes into request
 * paths, is published on the releases page, and is embedded in asset URLs — a
 * token can't be redacted from an identifier, so fail loudly before any
 * network call. Shared by the upload and --cleanup paths so the refusal can't
 * drift between them.
 */
export function refuseTokenBearingTag(token: string, tag: string): void {
  if (tag.includes(token)) {
    throw new Error(
      sanitize(
        token,
        "Refusing to use a --tag that contains the GitHub token.",
      ),
    );
  }
}

/**
 * Shared core of the response-URL re-binding validators (invariant 9):
 * `isUsableAssetUrl` (release.ts) and `usableCommentUrl` (github.ts). Applies
 * every check the two share before trusting a response-derived URL:
 *
 * - printable ASCII only — a real github.com URL percent-encodes everything
 *   else, so this rejects spaces, C0/C1 control chars, DEL, and Unicode
 *   separator/format chars (NEL, U+2028/9, BOM, RLO) that would otherwise
 *   reach an output surface once echoed;
 * - https on github.com with no credentials, port, or query — any of those
 *   would carry attacker-chosen junk (e.g. `user:SECRET@`, `?jwt=…`);
 * - already canonical (`url.href === value`) — anything `new URL()` had to
 *   normalize (raw `<">` in the path, `/../` traversal, a mixed-case host)
 *   is not a clean URL to echo or act on;
 * - path bound to the target owner/repo (case-insensitive, as GitHub
 *   canonicalizes owner/repo casing).
 *
 * Returns the parsed URL and path segments for the caller's endpoint-specific
 * binding (asset: releases/download/tag/name and no fragment; comment:
 * issues|pull/number plus the #issuecomment fragment), or null on any failure
 * — callers treat null as "drop / don't trust".
 */
export function boundGithubUrl(
  value: unknown,
  repo: Repo,
): { url: URL; segments: string[] } | null {
  if (typeof value !== "string" || value === "") return null;
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code < 0x21 || code > 0x7e) return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.search !== ""
  ) {
    return null;
  }
  if (url.href !== value) return null;
  const segments = url.pathname.split("/");
  if (
    segments[1]?.toLowerCase() !== repo.owner.toLowerCase() ||
    segments[2]?.toLowerCase() !== repo.name.toLowerCase()
  ) {
    return null;
  }
  return { url, segments };
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

/**
 * Validate `--max-size`, returning a positive number of megabytes (fractions
 * allowed). Requires a plain decimal so it matches validateNumber's strictness —
 * `0x10`, `1e3`, `+5`, `Infinity`, and `NaN` are rejected rather than silently
 * reinterpreted.
 */
export function validateMaxSize(input: string): number {
  const trimmed = input.trim();
  const mb = Number(trimmed);
  if (!/^\d*\.?\d+$/.test(trimmed) || !Number.isFinite(mb) || mb <= 0) {
    throw new Error(
      `Invalid --max-size: "${input}". Expected a positive number of MB.`,
    );
  }
  return mb;
}

/** Network transports a GitHub remote can legitimately use. */
const GIT_REMOTE_SCHEMES = new Set(["https:", "http:", "ssh:", "git:"]);

/**
 * Redact any credentials embedded in a remote's userinfo before it is shown in
 * an error. `git remote get-url origin` can return `https://user:TOKEN@host/…`
 * (GitHub Actions configures exactly this), so echoing the raw remote on a parse
 * failure would leak the secret to stderr / CI logs / agent context.
 *
 * A parseable URL has its username/password dropped precisely via the URL parser
 * (this correctly handles a `@` inside the password and never over-masks a `@`
 * that legitimately sits in the path). For scp-form (`git@host:path`) or a
 * malformed URL — where a raw `@`/`/` in the userinfo defeats a charset regex —
 * fall back to masking everything up to the LAST `@`. Over-masking there is safe:
 * a real GitHub owner/repo contains no `@`, so nothing identifying is hidden.
 */
function redactRemote(remote: string): string {
  if (remote.includes("://")) {
    try {
      const url = new URL(remote);
      if (url.username || url.password) {
        url.username = "";
        url.password = "";
        return url.toString();
      }
      return remote;
    } catch {
      // Malformed URL (e.g. a raw "/" in the userinfo) — fall through.
    }
  }
  return remote.replace(/(^|:\/\/).*@/, "$1***@");
}

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
      `Could not parse GitHub repo from remote: ${redactRemote(remote)}\n` +
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

  // DNS hosts are case-insensitive; the URL parser lowercases http(s) hosts but
  // not ssh:/git:/scp ones, so normalize here for a consistent compare.
  if (host.toLowerCase() !== "github.com") {
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
  /**
   * SHA-256 (hex) of the file contents AT VALIDATION TIME. uploadAsset re-reads
   * and compares against this, so a file swapped between validation/review and
   * upload — even to different bytes of the same length — is rejected rather
   * than uploaded unreviewed. (The validate→upload content binding.)
   */
  sha256: string;
}

function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

const HASH_CHUNK_BYTES = 64 * 1024;

/** Hash a file without ever reading more than maxBytes + 1 into memory. */
function sha256FileBounded(
  filepath: string,
  maxBytes: number,
): {
  bytes: number;
  sha256: string;
} {
  const fd = openSync(filepath, "r");
  const hash = createHash("sha256");
  const chunkSize = Math.max(1, Math.min(HASH_CHUNK_BYTES, maxBytes + 1));
  const chunk = Buffer.allocUnsafe(chunkSize);
  let total = 0;
  try {
    while (true) {
      const remaining = maxBytes + 1 - total;
      if (remaining <= 0) {
        throw new Error("grew past limit");
      }
      const read = readSync(
        fd,
        chunk,
        0,
        Math.min(chunk.length, remaining),
        null,
      );
      if (read === 0) break;
      total += read;
      if (total > maxBytes) {
        throw new Error("grew past limit");
      }
      hash.update(chunk.subarray(0, read));
    }
  } finally {
    closeSync(fd);
  }
  return { bytes: total, sha256: hash.digest("hex") };
}

/**
 * Validate an image file by stat plus bounded chunked hashing: exists → is a
 * regular file → non-empty → within the size limit → allowlisted MIME. Statting
 * before hashing rejects already-oversized files immediately; the bounded hash
 * closes the stat→read race without loading the whole file into memory.
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

  // Fingerprint the validated contents so the later upload can prove it's the
  // same file (see ImageFile.sha256). Re-stat immediately before hashing, then
  // read in bounded chunks so a file grown past --max-size since the stat cannot
  // be pulled into memory uncapped. All fs errors echo the CODE only — never
  // err.message, which embeds the path (it may carry an encoded token a literal
  // sanitize would miss).
  const readError = (err: unknown) =>
    new Error(
      `Cannot read file ${filepath}: ${(err as NodeJS.ErrnoException).code ?? "unknown error"}`,
    );
  let current: number;
  try {
    current = statSync(filepath).size;
  } catch (err) {
    throw readError(err);
  }
  if (current > maxBytes) {
    throw new Error(
      `File ${filepath} grew past the ${megabytes(maxBytes)}MB limit during validation; re-run.`,
    );
  }
  let hashed: { bytes: number; sha256: string };
  try {
    hashed = sha256FileBounded(filepath, maxBytes);
  } catch (err) {
    if (err instanceof Error && err.message === "grew past limit") {
      throw new Error(
        `File ${filepath} grew past the ${megabytes(maxBytes)}MB limit during validation; re-run.`,
      );
    }
    throw readError(err);
  }
  if (hashed.bytes !== size) {
    throw new Error(
      `File ${filepath} changed during validation (${size} → ${hashed.bytes} bytes); re-run.`,
    );
  }

  return { filepath, filename, mime, size, sha256: hashed.sha256 };
}
