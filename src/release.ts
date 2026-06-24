import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { authedFetch, sanitize } from "./auth.js";
import type { UploadResult } from "./upload.js";
import type { ImageFile, Repo } from "./validate.js";

const API = "https://api.github.com";
const UPLOADS = "https://uploads.github.com";

/** Prerelease metadata. Prerelease (not draft) is load-bearing: draft assets 404 by tag. */
const RELEASE_NAME = "⚠️ Image assets — do not delete";
const RELEASE_BODY =
  "This release hosts images embedded in issues and PRs.\n" +
  "Deleting it will break every image reference across this repo.\n\n" +
  "Managed by gh-imgup.";

/** Injectable I/O for the release functions (real defaults in production). */
export interface ReleaseDeps {
  fetchImpl?: typeof fetch;
  warn?: (message: string) => void;
}

function depsOf(deps: ReleaseDeps): {
  fetchImpl: typeof fetch;
  warn: (m: string) => void;
} {
  return {
    fetchImpl: deps.fetchImpl ?? fetch,
    warn:
      deps.warn ??
      ((m) => {
        process.stderr.write(m);
      }),
  };
}

/** Build a sanitized Error from a non-ok API response (token stripped, body truncated). */
async function apiError(
  token: string,
  res: Response,
  context: string,
  scope = "contents:write",
): Promise<Error> {
  let detail = "";
  try {
    detail = (await res.text()).slice(0, 500);
  } catch {
    // body already consumed or unreadable — status line is enough
  }
  const hint =
    res.status === 401 || res.status === 403
      ? ` (the token may be invalid or lack ${scope})`
      : "";
  const message = `${context} failed: ${res.status} ${res.statusText}${hint}${
    detail ? ` — ${detail}` : ""
  }`;
  return new Error(sanitize(token, new Error(message)));
}

/** True when a 422 create-release body reports the tag already exists (the race path). */
function isTagAlreadyExists(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const errors = (body as { errors?: unknown }).errors;
  return (
    Array.isArray(errors) &&
    errors.some(
      (e) =>
        typeof e === "object" &&
        e !== null &&
        (e as { code?: unknown }).code === "already_exists",
    )
  );
}

function repoPath(repo: Repo): string {
  return `${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
}

/**
 * Ensure the `_gh-imgup` prerelease exists, returning its id. Race-safe
 * create-or-get: GET by tag → 404 → POST create → on 422 `already_exists`
 * (a concurrent run won), retry the GET; any other 422 is a real error.
 */
export async function ensureRelease(
  token: string,
  repo: Repo,
  tag: string,
  deps: ReleaseDeps = {},
): Promise<number> {
  const { fetchImpl } = depsOf(deps);
  const tagUrl = `${API}/repos/${repoPath(repo)}/releases/tags/${encodeURIComponent(tag)}`;

  const got = await authedFetch(token, tagUrl, {}, fetchImpl);
  if (got.status === 200) {
    return ((await got.json()) as { id: number }).id;
  }
  if (got.status !== 404) {
    throw await apiError(token, got, "Look up release");
  }

  const created = await authedFetch(
    token,
    `${API}/repos/${repoPath(repo)}/releases`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tag_name: tag,
        name: RELEASE_NAME,
        body: RELEASE_BODY,
        prerelease: true,
        generate_release_notes: false,
      }),
    },
    fetchImpl,
  );
  if (created.status === 201) {
    return ((await created.json()) as { id: number }).id;
  }
  if (created.status === 422) {
    const body: unknown = await created.json().catch(() => null);
    if (isTagAlreadyExists(body)) {
      const retry = await authedFetch(token, tagUrl, {}, fetchImpl);
      if (retry.status === 200) {
        return ((await retry.json()) as { id: number }).id;
      }
      throw await apiError(token, retry, "Look up release after create race");
    }
    throw new Error(
      sanitize(
        token,
        new Error(`Create release failed: 422 — ${JSON.stringify(body)}`),
      ),
    );
  }
  throw await apiError(token, created, "Create release");
}

/** Collision-safe asset name `{stem}-{8 hex}{.ext}`; the hex is from randomUUID, never user input. */
function safeFilename(original: string): string {
  const ext = extname(original);
  const stem = basename(original, ext);
  const hex = randomUUID().replace(/-/g, "").slice(0, 8);
  return `${stem}-${hex}${ext.toLowerCase()}`;
}

/**
 * Upload one image as a release asset and verify its integrity. Computes the
 * local SHA-256, uploads, then compares against the API `digest`; on mismatch
 * the asset is deleted and the upload fails. A missing digest warns (the server
 * may omit it) rather than silently passing. Returns the render-ready result.
 */
export async function uploadAsset(
  token: string,
  repo: Repo,
  releaseId: number,
  file: ImageFile,
  deps: ReleaseDeps = {},
): Promise<UploadResult> {
  const { fetchImpl, warn } = depsOf(deps);
  const bytes = readFileSync(file.filepath);
  const localDigest = createHash("sha256").update(bytes).digest("hex");
  const assetName = safeFilename(file.filename);
  const uploadUrl = `${UPLOADS}/repos/${repoPath(repo)}/releases/${releaseId}/assets?name=${encodeURIComponent(assetName)}`;

  const res = await authedFetch(
    token,
    uploadUrl,
    { method: "POST", headers: { "Content-Type": file.mime }, body: bytes },
    fetchImpl,
  );
  if (res.status !== 201) {
    throw await apiError(token, res, `Upload ${file.filename}`);
  }

  const asset = (await res.json()) as {
    id: number;
    browser_download_url: string;
    digest?: string | null;
  };

  const remote = asset.digest
    ? asset.digest.replace(/^sha256:/i, "").toLowerCase()
    : null;
  if (remote === null) {
    warn(
      `⚠ Server returned no digest for ${file.filename} — integrity not verified\n`,
    );
  } else if (remote !== localDigest.toLowerCase()) {
    await deleteAsset(token, repo, asset.id, deps);
    throw new Error(
      `Integrity check failed for ${file.filename}: local ${localDigest} != remote ${remote}`,
    );
  }

  return {
    filename: file.filename,
    url: asset.browser_download_url,
    repo: `${repo.owner}/${repo.name}`,
    digest: asset.digest ?? "",
  };
}

/** Delete a release asset by id (used on integrity mismatch and by cleanup). */
export async function deleteAsset(
  token: string,
  repo: Repo,
  assetId: number,
  deps: ReleaseDeps = {},
): Promise<void> {
  const { fetchImpl } = depsOf(deps);
  const res = await authedFetch(
    token,
    `${API}/repos/${repoPath(repo)}/releases/assets/${assetId}`,
    { method: "DELETE" },
    fetchImpl,
  );
  if (res.status !== 204) {
    throw await apiError(token, res, `Delete asset ${assetId}`);
  }
}
