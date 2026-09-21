import { createHash, randomUUID } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import { apiError, leaksToken, redactBody, redactField } from "./apierr.js";
import { API, authedFetch, repoPath, sanitize, UPLOADS } from "./auth.js";
import { apiIoDefaults } from "./deps.js";
import { collapseControls } from "./markdown.js";
import type { UploadResult } from "./output.js";
import type { ImageFile, Repo } from "./validate.js";
import { boundGithubUrl, refuseTokenBearingTag } from "./validate.js";

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

/**
 * Read a numeric release id from a 2xx body, failing with operation context (and
 * sanitized) rather than letting a raw JSON parse error or a null/`.id` access
 * propagate when an intermediary returns an empty or non-JSON 2xx body. Also
 * enforces the prerelease invariant: the tag must resolve to a prerelease (our
 * created one always is), so we refuse to dump image assets into a real
 * published release that happens to use the tag rather than silently using it.
 */
export async function releaseId(
  token: string,
  res: Response,
  context: string,
  tag: string,
): Promise<number> {
  const body = (await res.json().catch(() => null)) as {
    id?: unknown;
    prerelease?: unknown;
    draft?: unknown;
    tag_name?: unknown;
  } | null;
  if (
    !body ||
    typeof body.id !== "number" ||
    !Number.isSafeInteger(body.id) ||
    body.id <= 0
  ) {
    throw new Error(
      sanitize(token, new Error(`${context} returned no usable release id`)),
    );
  }
  // The response must be for the tag we asked for: a wrong/absent tag_name means
  // we'd otherwise upload to a different release. Tags are case-sensitive.
  if (body.tag_name !== tag) {
    throw new Error(
      sanitize(
        token,
        new Error(`${context} returned a release for a different tag`),
      ),
    );
  }
  // The invariant is "prerelease, never draft": a draft asset's
  // browser_download_url 404s by tag, so a draft would report success while
  // producing broken images. Require draft to be EXPLICITLY false (real GitHub
  // responses always include the boolean), so a malformed/absent draft flag —
  // like the prerelease check — fails closed rather than being assumed safe.
  if (body.prerelease !== true || body.draft !== false) {
    throw new Error(
      sanitize(
        token,
        new Error(
          `The "${tag}" release must be a non-draft prerelease; refusing to use it. ` +
            `Delete it or pass a different --tag (must start with "_").`,
        ),
      ),
    );
  }
  return body.id;
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
  const { fetchImpl } = apiIoDefaults(deps);
  refuseTokenBearingTag(token, tag);
  const tagUrl = `${API}/repos/${repoPath(repo)}/releases/tags/${encodeURIComponent(tag)}`;

  const got = await authedFetch(token, tagUrl, {}, fetchImpl);
  if (got.status === 200) {
    return releaseId(token, got, "Look up release", tag);
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
        draft: false,
        generate_release_notes: false,
      }),
    },
    fetchImpl,
  );
  if (created.status === 201) {
    return releaseId(token, created, "Create release", tag);
  }
  if (created.status === 422) {
    // Read the body once as text so a non-JSON 422 still yields real detail
    // (and is truncated); JSON.parse only drives the already_exists check.
    const text = await created.text().catch(() => "");
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      // non-JSON 422 body — fall through with body = null
    }
    if (isTagAlreadyExists(body)) {
      const retry = await authedFetch(token, tagUrl, {}, fetchImpl);
      if (retry.status === 200) {
        return releaseId(
          token,
          retry,
          "Look up release after create race",
          tag,
        );
      }
      // A 404 here means the tag exists but isn't resolvable by tag — almost
      // always a draft release. For any other retry failure (403/500/…), the
      // real API error is more useful than the draft remediation, so surface it.
      if (retry.status === 404) {
        throw new Error(
          sanitize(
            token,
            `The "${tag}" tag is already taken (create returned already_exists) but no release resolves by that tag — it is likely a draft. Delete it or pass a different --tag.`,
          ),
        );
      }
      throw await apiError(token, retry, "Look up release after create race");
    }
    const detail = redactBody(token, text);
    throw new Error(
      sanitize(
        token,
        new Error(`Create release failed: 422${detail ? ` — ${detail}` : ""}`),
      ),
    );
  }
  throw await apiError(token, created, "Create release");
}

/**
 * Collision-safe asset name `{stem}-{8 hex}{.ext}` plus the hex itself. The hex
 * is from randomUUID (never user input) and is unique per upload, so it also
 * lets us bind the returned URL to THIS upload (GitHub keeps the alphanumeric
 * hex even when it sanitizes the stem, so binding on the hex doesn't over-reject).
 */
function safeFilename(original: string): { name: string; hex: string } {
  const ext = extname(original);
  const stem = basename(original, ext);
  const hex = randomUUID().replace(/-/g, "").slice(0, 8);
  return { name: `${stem}-${hex}${ext.toLowerCase()}`, hex };
}

/**
 * Whether a 201 `browser_download_url` is a real, usable release-asset URL for
 * the TARGET repo and tag: a clean (no spaces/control chars), parseable, https
 * URL on github.com whose path is exactly
 * `/{owner}/{repo}/releases/download/{tag}/{asset}` — owner/repo matching `repo`
 * (case-insensitive, since GitHub owner/repo are; GitHub may canonicalize the
 * casing in the URL) and the tag segment matching `tag` (case-sensitive). This
 * rejects junk (`https://`, whitespace, credentials, query/fragment) AND binds
 * the URL to what we uploaded: a tampered 201 pointing at another repo, another
 * release tag, or elsewhere is not accepted.
 */
export function isUsableAssetUrl(
  value: unknown,
  repo: Repo,
  tag: string,
): value is string {
  // Shared re-binding core (printable ASCII, https github.com, no
  // creds/port/query, canonical, owner/repo bound) — see boundGithubUrl.
  const bound = boundGithubUrl(value, repo);
  if (!bound) {
    return false;
  }
  // A real asset URL has no fragment either — a #… would carry response-chosen
  // junk past the canonical check.
  if (bound.url.hash !== "") {
    return false;
  }
  // Exact path /{owner}/{repo}/releases/download/{tag}/{asset}, bound to the
  // upload target — not the marker anywhere, another repo, or another tag.
  const { segments } = bound;
  return (
    segments.length === 7 &&
    segments[3] === "releases" &&
    segments[4] === "download" &&
    segments[5] === tag &&
    segments[6] !== ""
  );
}

/**
 * Best-effort cleanup of an asset we created but then reject (integrity mismatch
 * or an unusable returned URL): delete it, but never let a failed delete replace
 * the real error — warn (sanitized) and carry on so the caller still sees why.
 */
async function bestEffortDelete(
  token: string,
  repo: Repo,
  assetId: number,
  context: string,
  deps: ReleaseDeps,
): Promise<void> {
  const { warn } = apiIoDefaults(deps);
  try {
    await deleteAsset(token, repo, assetId, deps);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    warn(
      sanitize(
        token,
        `⚠ Could not delete asset ${assetId} (${context}); remove it manually: ${reason}\n`,
      ),
    );
  }
}

/**
 * GET a release asset by id and parse its body, or `null` on any failure — a
 * network throw, a non-200 status, or an unparseable body. Makes no acceptance
 * decision of its own: `verifiedDelete` (URL-only, `isUsableAssetUrl`-checked)
 * and cleanup's `idStillHostsUrl` (URL+name, no shape check) apply their own,
 * intentionally different, policies to the result.
 */
export async function fetchAssetById(
  token: string,
  repo: Repo,
  assetId: number,
  fetchImpl: typeof fetch,
): Promise<{ browser_download_url?: unknown; name?: unknown } | null> {
  let res: Response;
  try {
    res = await authedFetch(
      token,
      `${API}/repos/${repoPath(repo)}/releases/assets/${assetId}`,
      {},
      fetchImpl,
    );
  } catch {
    return null;
  }
  if (res.status !== 200) return null;
  return (await res.json().catch(() => null)) as {
    browser_download_url?: unknown;
    name?: unknown;
  } | null;
}

/**
 * Delete an asset we created but rejected — but only after confirming the id is
 * OURS. The 201's browser_download_url was bound to our upload (repo/tag/hex),
 * yet `asset.id` is a SEPARATE field: a malformed body could pair our URL with
 * another asset's id, and deleting by it would remove an unrelated asset. So
 * re-fetch the asset by id from a trusted GET and delete only if THAT id still
 * hosts the exact URL the upload response bound to this run. Anything else — a
 * non-200 GET, an unparseable body, or a different URL — warns about a possible
 * orphan instead of issuing a destructive delete by an id we can't confirm. We
 * bind on the URL, not the asset name: the accepted browser_download_url already
 * encodes GitHub's stored (possibly sanitized) filename, so comparing the
 * re-fetched name to the name we *requested* would false-skip cleanup whenever
 * GitHub renames the file. Preserves invariant 6's delete-on-mismatch for our
 * own asset while closing the unbound-id data-loss path.
 */
async function verifiedDelete(
  token: string,
  repo: Repo,
  assetId: number,
  tag: string,
  expectedUrl: string,
  context: string,
  deps: ReleaseDeps,
): Promise<void> {
  const { fetchImpl, warn } = apiIoDefaults(deps);
  const orphanWarn = () =>
    warn(
      sanitize(
        token,
        `⚠ Could not confirm asset ${assetId} (${context}) is the one we uploaded; not deleting it. Run gh-imgup --cleanup to remove orphans.\n`,
      ),
    );
  const got = await fetchAssetById(token, repo, assetId, fetchImpl);
  const gotUrl = got?.browser_download_url;
  if (!isUsableAssetUrl(gotUrl, repo, tag) || gotUrl !== expectedUrl) {
    orphanWarn();
    return;
  }
  await bestEffortDelete(token, repo, assetId, context, deps);
}

/**
 * Redact the literal token from a filename, then reject if ANY encoded token
 * survives (mixed literal+encoded, or encoded-only) — sanitize can't strip
 * encoded forms, and they'd otherwise reach the public asset name or error
 * messages. Must run BEFORE any file I/O. Also returns the control-char-
 * collapsed display filename used by every later display surface: the
 * returned filename (--json `filename` / the stderr "✓ Uploaded …" line) and
 * the success-path no-digest warning, so a raw DEL/C1 in the name can't reach
 * stderr later. The name also becomes Markdown alt text on stdout, so this
 * also rejects a token hidden in a RENDERED form — HTML entities (e.g.
 * `ghp&lowbar;TOK` -> `ghp_TOK`) that a plain decode check wouldn't catch but
 * GitHub's Markdown would. `leaksToken` (apierr.ts) mirrors the public
 * comment guard (github.ts) so upload-only stdout gets the same
 * rendered-form refusal (invariant 3).
 */
function guardFilename(
  token: string,
  filename: string,
): { displayName: string; displayFilename: string } {
  const displayName = sanitize(token, filename);
  if (leaksToken(displayName, token)) {
    throw new Error(
      sanitize(
        token,
        "Refusing to upload a file whose name encodes the token.",
      ),
    );
  }
  return { displayName, displayFilename: collapseControls(displayName) };
}

/**
 * Re-validate the file on disk immediately before upload and return its bytes
 * plus their SHA-256. fs errors echo the error CODE only — never
 * `err.message`, which embeds the full filepath; unlike the checked basename,
 * a directory component could carry an encoded token (the basename itself is
 * checked by `guardFilename`). Re-stats BEFORE reading: a file
 * replaced/grown after `validateImageFile` (TOCTOU) is rejected here, so
 * `readFileSync` never pulls a now-arbitrarily-large file into memory —
 * bounding memory despite --max-size. Then re-checks the size again right
 * after the read (the tiny stat→read window) and finally compares the
 * freshly computed digest against the validation-time `file.sha256`: a file
 * replaced with different bytes of the SAME length — which the size checks
 * can't catch — must not be uploaded unreviewed.
 */
function readValidatedFile(
  token: string,
  file: ImageFile,
  displayFilename: string,
): { bytes: Buffer; localDigest: string } {
  const readFailed = (err: unknown) => {
    const code = (err as NodeJS.ErrnoException).code ?? "read failed";
    return new Error(
      sanitize(token, `Cannot read ${displayFilename}: ${code}`),
    );
  };
  let current: number;
  try {
    current = statSync(file.filepath).size;
  } catch (err) {
    throw readFailed(err);
  }
  if (current !== file.size) {
    throw new Error(
      sanitize(
        token,
        `File ${displayFilename} changed after validation (${file.size} → ${current} bytes); re-run.`,
      ),
    );
  }
  let bytes: Buffer;
  try {
    bytes = readFileSync(file.filepath);
  } catch (err) {
    throw readFailed(err);
  }
  if (bytes.length !== file.size) {
    throw new Error(
      sanitize(
        token,
        `File ${displayFilename} changed after validation (${file.size} → ${bytes.length} bytes); re-run.`,
      ),
    );
  }
  const localDigest = createHash("sha256").update(bytes).digest("hex");
  if (localDigest !== file.sha256) {
    throw new Error(
      sanitize(
        token,
        `File ${displayFilename} changed after validation; re-run.`,
      ),
    );
  }
  return { bytes, localDigest };
}

/** Raw shape of a 201 upload-asset response body, before any field beyond `id` is validated. */
interface RawUploadAsset {
  id?: unknown;
  browser_download_url?: unknown;
  digest?: unknown;
  size?: unknown;
  content_type?: unknown;
  state?: unknown;
}

/**
 * POST the file bytes to create the release asset and validate the success
 * payload before trusting it: a 201 with a malformed body must not yield
 * `url: undefined` on stdout (exit 0) or an undefined asset id for the
 * mismatch-cleanup delete. A valid asset id comes first — both to render and
 * to clean up if a later check rejects the (already-created) asset. An
 * omitted digest stays the documented warning-only case, handled downstream.
 */
async function postAssetUpload(
  token: string,
  repo: Repo,
  releaseId: number,
  assetName: string,
  bytes: Buffer,
  mime: string,
  filename: string,
  fetchImpl: typeof fetch,
): Promise<RawUploadAsset & { id: number }> {
  const uploadUrl = `${UPLOADS}/repos/${repoPath(repo)}/releases/${releaseId}/assets?name=${encodeURIComponent(assetName)}`;

  const res = await authedFetch(
    token,
    uploadUrl,
    { method: "POST", headers: { "Content-Type": mime }, body: bytes },
    fetchImpl,
  );
  if (res.status !== 201) {
    throw await apiError(token, res, `Upload ${filename}`);
  }

  const asset = (await res.json().catch(() => null)) as RawUploadAsset | null;
  if (
    !asset ||
    typeof asset.id !== "number" ||
    !Number.isSafeInteger(asset.id) ||
    asset.id <= 0
  ) {
    throw new Error(
      sanitize(
        token,
        new Error(
          `Upload ${filename} returned an unexpected response (missing asset id)`,
        ),
      ),
    );
  }
  return asset as RawUploadAsset & { id: number };
}

/**
 * The URL must be usable, already canonical (real GitHub URLs are
 * percent-encoded, so reject raw delimiters like <,>,"), bound to THIS
 * repo+tag, carry our unique hex (so a tampered 201 can't return a stale
 * same-repo+tag asset), and contain no token at any decode depth. We do NOT
 * delete on failure here: the URL didn't bind to our upload, so the asset id
 * is unverified — deleting it could remove an unrelated asset. Warn instead.
 */
function bindResponseUrl(
  token: string,
  repo: Repo,
  tag: string,
  hex: string,
  filename: string,
  downloadUrl: unknown,
  warn: (message: string) => void,
): string {
  if (
    !isUsableAssetUrl(downloadUrl, repo, tag) ||
    !(downloadUrl.split("/").pop() ?? "").includes(hex) ||
    leaksToken(downloadUrl, token)
  ) {
    warn(
      sanitize(
        token,
        `⚠ Upload of ${filename} returned an unusable URL; an asset may have been created — run gh-imgup --cleanup to remove orphans.\n`,
      ),
    );
    throw new Error(
      sanitize(
        token,
        new Error(
          `Upload ${filename} returned an unexpected response (unusable asset URL)`,
        ),
      ),
    );
  }
  return downloadUrl;
}

/**
 * Once the URL is bound to our upload, a present `content_type` that differs
 * from what we sent (a server rewrite to octet-stream/svg) breaks the
 * strict-MIME invariant; a present `state` other than "uploaded" (e.g. a
 * "starter" leftover) is an incomplete asset. Either fails closed: the asset
 * id is a separate field from the bound URL, so cleanup goes through
 * `verifiedDelete` (re-fetch by id, delete only if it hosts our upload)
 * rather than trusting the id outright.
 */
async function rejectInvalidAssetShape(
  token: string,
  repo: Repo,
  tag: string,
  assetId: number,
  downloadUrl: string,
  filename: string,
  mime: string,
  contentType: unknown,
  state: unknown,
  deps: ReleaseDeps,
): Promise<void> {
  if (contentType !== undefined && contentType !== mime) {
    await verifiedDelete(
      token,
      repo,
      assetId,
      tag,
      downloadUrl,
      `mime-mismatch ${filename}`,
      deps,
    );
    throw new Error(
      sanitize(
        token,
        new Error(
          `Upload ${filename} stored as ${redactField(contentType, token)}, not ${mime}`,
        ),
      ),
    );
  }
  if (state !== undefined && state !== "uploaded") {
    await verifiedDelete(
      token,
      repo,
      assetId,
      tag,
      downloadUrl,
      `bad-state ${filename}`,
      deps,
    );
    throw new Error(
      sanitize(
        token,
        new Error(
          `Upload ${filename} is not in the uploaded state (${redactField(state, token)})`,
        ),
      ),
    );
  }
}

/**
 * Verify the uploaded bytes against the API `digest`, returning the
 * canonical `UploadResult.digest` value (`""` or `sha256:<lowercased hex>`,
 * never the raw server string). Only an absent/null digest is the documented
 * warn-only case. A present digest that is empty, non-string (false/0), or
 * otherwise malformed must fail closed — never skip verification — so it
 * routes to the mismatch branch below. With no digest to verify against,
 * falls back to the response size if present: a mismatch — or a
 * present-but-non-number size (the only signal left here) — means we can't
 * confirm the stored bytes, so fails closed too. A failed cleanup delete is
 * always a warning, not a replacement error, so the caller still learns the
 * upload was corrupt/unverified either way.
 */
async function verifyIntegrity(
  token: string,
  repo: Repo,
  tag: string,
  assetId: number,
  downloadUrl: string,
  digest: unknown,
  size: unknown,
  bytes: Buffer,
  localDigest: string,
  displayFilename: string,
  deps: ReleaseDeps,
): Promise<string> {
  const { warn } = apiIoDefaults(deps);
  let remote: string | null;
  if (digest === undefined || digest === null) {
    remote = null;
  } else if (typeof digest === "string" && digest !== "") {
    remote = digest.replace(/^sha256:/i, "").toLowerCase();
  } else {
    remote = "(malformed)"; // present but unusable → guaranteed mismatch
  }
  if (remote === null) {
    if (size !== undefined && size !== bytes.length) {
      await verifiedDelete(
        token,
        repo,
        assetId,
        tag,
        downloadUrl,
        `size-mismatch ${displayFilename}`,
        deps,
      );
      throw new Error(
        sanitize(
          token,
          new Error(
            `Upload ${displayFilename} size mismatch: local ${bytes.length} != server ${redactField(size, token)}`,
          ),
        ),
      );
    }
    // This is a success-path stderr line, so — like every other interpolation
    // in this function — it uses displayFilename: a raw DEL/C1 in the name
    // must not reach the terminal/CI log.
    warn(
      sanitize(
        token,
        `⚠ Server returned no digest for ${displayFilename} — integrity not verified\n`,
      ),
    );
    return "";
  }
  if (remote !== localDigest.toLowerCase()) {
    await verifiedDelete(
      token,
      repo,
      assetId,
      tag,
      downloadUrl,
      `integrity-failed ${displayFilename}`,
      deps,
    );
    // `remote` is response-derived, so it goes through sanitize; and a non-hex
    // digest is shown as a placeholder rather than echoed verbatim.
    const shownRemote = /^[0-9a-f]{64}$/.test(remote)
      ? remote
      : "(malformed digest)";
    throw new Error(
      sanitize(
        token,
        new Error(
          `Integrity check failed for ${displayFilename}: local ${localDigest} != remote ${shownRemote}`,
        ),
      ),
    );
  }
  // Emit the canonical, verified digest rather than the raw server string, so
  // --json always honors the sha256:<hex> contract.
  return `sha256:${remote}`;
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
  tag: string,
  file: ImageFile,
  deps: ReleaseDeps = {},
): Promise<UploadResult> {
  const { fetchImpl, warn } = apiIoDefaults(deps);
  const { displayName, displayFilename } = guardFilename(token, file.filename);
  const { bytes, localDigest } = readValidatedFile(
    token,
    file,
    displayFilename,
  );
  // displayName (token-redacted) becomes the public asset name (in
  // browser_download_url) and the returned filename (markdown alt).
  const { name: assetName, hex } = safeFilename(displayName);

  const asset = await postAssetUpload(
    token,
    repo,
    releaseId,
    assetName,
    bytes,
    file.mime,
    displayFilename,
    fetchImpl,
  );
  const downloadUrl = bindResponseUrl(
    token,
    repo,
    tag,
    hex,
    displayFilename,
    asset.browser_download_url,
    warn,
  );
  await rejectInvalidAssetShape(
    token,
    repo,
    tag,
    asset.id,
    downloadUrl,
    displayFilename,
    file.mime,
    asset.content_type,
    asset.state,
    deps,
  );
  const digest = await verifyIntegrity(
    token,
    repo,
    tag,
    asset.id,
    downloadUrl,
    asset.digest,
    asset.size,
    bytes,
    localDigest,
    displayFilename,
    deps,
  );

  return {
    // The returned filename echoes verbatim into the --json `filename` field and
    // the stderr "✓ Uploaded …" progress line, so it uses the control-char-
    // collapsed display name (the markdown alt is collapsed separately by
    // escapeAltText).
    filename: displayFilename,
    url: downloadUrl,
    repo: `${repo.owner}/${repo.name}`,
    digest,
  };
}

/** Delete a release asset by id (used on integrity mismatch and by cleanup). */
export async function deleteAsset(
  token: string,
  repo: Repo,
  assetId: number,
  deps: ReleaseDeps = {},
): Promise<void> {
  const { fetchImpl } = apiIoDefaults(deps);
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
