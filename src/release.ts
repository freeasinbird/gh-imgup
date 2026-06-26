import { createHash, randomUUID } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import { apiError, decodesToToken, redactBody, redactField } from "./apierr.js";
import { API, authedFetch, repoPath, sanitize, UPLOADS } from "./auth.js";
import { renderInlineMarkdown } from "./markdown.js";
import type { UploadResult } from "./upload.js";
import type { ImageFile, Repo } from "./validate.js";

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
  const { fetchImpl } = depsOf(deps);
  // The tag is published on the releases page and embedded in asset URLs; never
  // create a release whose tag carries the token (a token can't be redacted from
  // an identifier, so fail loud).
  if (tag.includes(token)) {
    throw new Error(
      sanitize(
        token,
        "Refusing to use a --tag that contains the GitHub token.",
      ),
    );
  }
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
  if (typeof value !== "string" || value === "") {
    return false;
  }
  for (const ch of value) {
    // Printable ASCII only: a real asset URL percent-encodes everything else, so
    // this rejects spaces, C0/C1 control chars, DEL, and Unicode separators /
    // format chars (NEL, U+2028/9, BOM, RLO) that would otherwise reach stdout.
    const code = ch.charCodeAt(0);
    if (code < 0x21 || code > 0x7e) {
      return false;
    }
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  // No credentials, port, query, or fragment — a real asset URL has none, and
  // any of them would carry attacker-chosen junk (e.g. user:SECRET@, ?jwt=…).
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    return false;
  }
  // Real GitHub asset URLs are already canonical/percent-encoded, so anything
  // new URL() had to normalize (e.g. raw <,>," in the path) means the response
  // value isn't a clean asset URL — reject it rather than print the raw form.
  if (url.href !== value) {
    return false;
  }
  // Exact path /{owner}/{repo}/releases/download/{tag}/{asset}, bound to the
  // upload target — not the marker anywhere, another repo, or another tag.
  const segments = url.pathname.split("/");
  return (
    segments.length === 7 &&
    segments[1]?.toLowerCase() === repo.owner.toLowerCase() &&
    segments[2]?.toLowerCase() === repo.name.toLowerCase() &&
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
  const { warn } = depsOf(deps);
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
  const { fetchImpl, warn } = depsOf(deps);
  const orphanWarn = () =>
    warn(
      sanitize(
        token,
        `⚠ Could not confirm asset ${assetId} (${context}) is the one we uploaded; not deleting it. Run gh-imgup --cleanup to remove orphans.\n`,
      ),
    );
  let got: { browser_download_url?: unknown } | null;
  try {
    const res = await authedFetch(
      token,
      `${API}/repos/${repoPath(repo)}/releases/assets/${assetId}`,
      {},
      fetchImpl,
    );
    if (res.status !== 200) {
      orphanWarn();
      return;
    }
    got = (await res.json().catch(() => null)) as {
      browser_download_url?: unknown;
    } | null;
  } catch {
    orphanWarn();
    return;
  }
  const gotUrl = got?.browser_download_url;
  if (!isUsableAssetUrl(gotUrl, repo, tag) || gotUrl !== expectedUrl) {
    orphanWarn();
    return;
  }
  await bestEffortDelete(token, repo, assetId, context, deps);
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
  const { fetchImpl, warn } = depsOf(deps);
  // Redact the literal token from the name, then reject if ANY encoded token
  // survives (mixed literal+encoded, or encoded-only) — sanitize can't strip
  // encoded forms, and they'd otherwise reach the public asset name or error
  // messages. Done BEFORE any file I/O. The display/asset name reuses this.
  // The name also becomes Markdown alt text on stdout, so reject a token hidden
  // in a RENDERED form too — HTML entities (e.g. `ghp&lowbar;TOK` -> `ghp_TOK`)
  // that decodesToToken doesn't decode but GitHub's Markdown does. This mirrors
  // the public comment guard (github.ts) so upload-only stdout gets the same
  // rendered-form refusal (invariant 3).
  const displayName = sanitize(token, file.filename);
  if (
    decodesToToken(displayName, token) ||
    decodesToToken(renderInlineMarkdown(displayName), token)
  ) {
    throw new Error(
      sanitize(
        token,
        "Refusing to upload a file whose name encodes the token.",
      ),
    );
  }
  // fs errors echo the error CODE only — never err.message, which embeds the
  // full filepath; unlike the checked basename, a directory component could
  // carry an encoded token. file.filename (basename) is checked above.
  const readFailed = (err: unknown) => {
    const code = (err as NodeJS.ErrnoException).code ?? "read failed";
    return new Error(sanitize(token, `Cannot read ${file.filename}: ${code}`));
  };
  // Re-stat BEFORE reading: a file replaced/grown after validateImageFile
  // (TOCTOU) is rejected here, so readFileSync never pulls a now-arbitrarily-
  // large file into memory — bounding memory despite --max-size.
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
        `File ${file.filename} changed after validation (${file.size} → ${current} bytes); re-run.`,
      ),
    );
  }
  let bytes: Buffer;
  try {
    bytes = readFileSync(file.filepath);
  } catch (err) {
    throw readFailed(err);
  }
  // Backstop for the tiny stat→read window: if the file grew between the stat
  // and the read, reject before hashing/uploading the wrong (unvalidated) bytes.
  if (bytes.length !== file.size) {
    throw new Error(
      sanitize(
        token,
        `File ${file.filename} changed after validation (${file.size} → ${bytes.length} bytes); re-run.`,
      ),
    );
  }
  const localDigest = createHash("sha256").update(bytes).digest("hex");
  // Bind the upload to the content validated up front: a file replaced between
  // validateImageFile (which fingerprinted it) and now — even with different
  // bytes of the SAME length, which the size recheck above can't catch — must
  // not be uploaded unreviewed. Compare the just-computed digest to the
  // validation-time one and fail closed before sending anything.
  if (localDigest !== file.sha256) {
    throw new Error(
      sanitize(
        token,
        `File ${file.filename} changed after validation; re-run.`,
      ),
    );
  }
  // displayName (token-redacted) was computed above; it becomes the public asset
  // name (in browser_download_url) and the returned filename (markdown alt).
  const { name: assetName, hex } = safeFilename(displayName);
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

  // Validate the success payload before trusting it: a 201 with a malformed
  // body must not yield `url: undefined` on stdout (exit 0) or an undefined
  // asset id for the mismatch-cleanup delete. An omitted digest stays the
  // documented warning-only case.
  const asset = (await res.json().catch(() => null)) as {
    id?: unknown;
    browser_download_url?: unknown;
    digest?: unknown;
    size?: unknown;
    content_type?: unknown;
    state?: unknown;
  } | null;
  // A valid asset id comes first — both to render and to clean up if a later
  // check rejects the (already-created) asset.
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
          `Upload ${file.filename} returned an unexpected response (missing asset id)`,
        ),
      ),
    );
  }
  // The URL must be usable, already canonical (real GitHub URLs are
  // percent-encoded, so reject raw delimiters like <,>,"), bound to THIS
  // repo+tag, carry our unique hex (so a tampered 201 can't return a stale
  // same-repo+tag asset), and contain no token at any decode depth. We do NOT
  // delete on failure here: the URL didn't bind to our upload, so asset.id is
  // unverified — deleting it could remove an unrelated asset. Warn instead.
  const downloadUrl = asset.browser_download_url;
  if (
    !isUsableAssetUrl(downloadUrl, repo, tag) ||
    !(downloadUrl.split("/").pop() ?? "").includes(hex) ||
    decodesToToken(downloadUrl, token) ||
    decodesToToken(renderInlineMarkdown(downloadUrl), token)
  ) {
    warn(
      sanitize(
        token,
        `⚠ Upload of ${file.filename} returned an unusable URL; an asset may have been created — run gh-imgup --cleanup to remove orphans.\n`,
      ),
    );
    throw new Error(
      sanitize(
        token,
        new Error(
          `Upload ${file.filename} returned an unexpected response (unusable asset URL)`,
        ),
      ),
    );
  }
  // The URL is bound to our upload; the remaining checks may reject the asset and
  // clean it up. asset.id is a separate field, so cleanup goes through
  // verifiedDelete (re-fetch by id, delete only if it hosts our upload) rather
  // than trusting the id outright. A present content_type that differs from what
  // we sent (a server rewrite to octet-stream/svg) breaks the strict-MIME
  // invariant; a present state other than "uploaded" (e.g. a "starter" leftover)
  // is an incomplete asset. Either fails closed.
  if (asset.content_type !== undefined && asset.content_type !== file.mime) {
    await verifiedDelete(
      token,
      repo,
      asset.id,
      tag,
      downloadUrl,
      `mime-mismatch ${file.filename}`,
      deps,
    );
    throw new Error(
      sanitize(
        token,
        new Error(
          `Upload ${file.filename} stored as ${redactField(asset.content_type, token)}, not ${file.mime}`,
        ),
      ),
    );
  }
  if (asset.state !== undefined && asset.state !== "uploaded") {
    await verifiedDelete(
      token,
      repo,
      asset.id,
      tag,
      downloadUrl,
      `bad-state ${file.filename}`,
      deps,
    );
    throw new Error(
      sanitize(
        token,
        new Error(
          `Upload ${file.filename} is not in the uploaded state (${redactField(asset.state, token)})`,
        ),
      ),
    );
  }
  // Only an absent/null digest is the documented warn-only case. A present
  // digest that is empty, non-string (false/0), or otherwise malformed must
  // fail closed — never skip verification — so it routes to the mismatch branch.
  let remote: string | null;
  if (asset.digest === undefined || asset.digest === null) {
    remote = null;
  } else if (typeof asset.digest === "string" && asset.digest !== "") {
    remote = asset.digest.replace(/^sha256:/i, "").toLowerCase();
  } else {
    remote = "(malformed)"; // present but unusable → guaranteed mismatch
  }
  if (remote === null) {
    // No digest to verify against. Fall back to the response size if present: a
    // mismatch — or a present-but-non-number size (the only signal left here) —
    // means we can't confirm the stored bytes, so fail closed.
    if (asset.size !== undefined && asset.size !== bytes.length) {
      await verifiedDelete(
        token,
        repo,
        asset.id,
        tag,
        downloadUrl,
        `size-mismatch ${file.filename}`,
        deps,
      );
      throw new Error(
        sanitize(
          token,
          new Error(
            `Upload ${file.filename} size mismatch: local ${bytes.length} != server ${redactField(asset.size, token)}`,
          ),
        ),
      );
    }
    // file.filename is user-controlled, so the whole warning is sanitized too.
    warn(
      sanitize(
        token,
        `⚠ Server returned no digest for ${file.filename} — integrity not verified\n`,
      ),
    );
  } else if (remote !== localDigest.toLowerCase()) {
    // Always surface the integrity failure; a failed cleanup is a warning, not a
    // replacement error, so the caller still learns the upload was corrupt.
    await verifiedDelete(
      token,
      repo,
      asset.id,
      tag,
      downloadUrl,
      `integrity-failed ${file.filename}`,
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
          `Integrity check failed for ${file.filename}: local ${localDigest} != remote ${shownRemote}`,
        ),
      ),
    );
  }

  return {
    filename: displayName,
    url: downloadUrl,
    repo: `${repo.owner}/${repo.name}`,
    // Emit the canonical, verified digest (or "" when omitted) rather than the
    // raw server string, so --json always honors the sha256:<hex> contract.
    digest: remote === null ? "" : `sha256:${remote}`,
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
