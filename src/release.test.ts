import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { deleteAsset, ensureRelease, uploadAsset } from "./release.js";
import type { ImageFile, Repo } from "./validate.js";

const REPO: Repo = { owner: "o", name: "r" };
// A realistic token: sanitize() redacts the whole token string, so a 1-char
// token like "t" would over-redact every "t" in an error message.
const TOKEN = "ghp_TOK";
// A valid release-asset download URL shape (github.com, under /releases/download/).
const ASSET_URL =
  "https://github.com/o/r/releases/download/_gh-imgup/x-a1b2c3d4.png";
const TAG = "_gh-imgup";

interface FakeCall {
  url: string;
  method: string;
  init: RequestInit;
}

/** A fetch stand-in driven by a per-call handler; records every request. */
function scriptedFetch(
  handler: (req: FakeCall, index: number) => Response | Promise<Response>,
) {
  const calls: FakeCall[] = [];
  const impl = ((url: string | URL, init: RequestInit = {}) => {
    const req: FakeCall = {
      url: String(url),
      method: init.method ?? "GET",
      init,
    };
    calls.push(req);
    return Promise.resolve(handler(req, calls.length - 1));
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * A realistic 201 upload response: GitHub derives the asset URL from the name we
 * sent, so echo that name back (carrying our random hex) — overridable for
 * tampering tests. Lets tests exercise the hex/repo/tag URL binding faithfully.
 */
function uploadOk(
  req: FakeCall,
  opts: {
    id?: number;
    digest?: string | null | boolean;
    size?: number;
    owner?: string;
    repo?: string;
    url?: string;
  } = {},
): Response {
  const name = new URL(req.url).searchParams.get("name") ?? "";
  const owner = opts.owner ?? "o";
  const repo = opts.repo ?? "r";
  // Canonicalize via the URL parser, as GitHub does (it percent-encodes the
  // asset name), so the response URL is already in canonical form.
  const url =
    opts.url ??
    new URL(
      `https://github.com/${owner}/${repo}/releases/download/_gh-imgup/${name}`,
    ).href;
  const body: Record<string, unknown> = {
    id: opts.id ?? 5,
    browser_download_url: url,
  };
  if ("digest" in opts) body.digest = opts.digest;
  if ("size" in opts) body.size = opts.size;
  return json(body, 201);
}

/** The canonical asset URL GitHub derives from an upload name (default repo). */
const assetUrl = (name: string, owner = "o", repo = "r") =>
  new URL(
    `https://github.com/${owner}/${repo}/releases/download/_gh-imgup/${name}`,
  ).href;

/**
 * A scriptedFetch for the cleanup path. `post` builds the 201 from the request
 * (its URL must echo the sent name, as real GitHub does); the verify GET that
 * `verifiedDelete` issues for the created asset id returns the same URL we sent
 * back (so cleanup confirms the asset is ours and proceeds), unless `verifyGet`
 * overrides it (e.g. a 404 or a different asset's URL to simulate an unbound
 * id). DELETE returns `deleteStatus` (default 204).
 */
function cleanupFetch(
  post: (req: FakeCall) => Response,
  opts: {
    verifyGet?: (ourUrl: string) => Response;
    deleteStatus?: number;
  } = {},
) {
  let ourUrl = "";
  return scriptedFetch((req) => {
    if (req.method === "POST") {
      ourUrl = assetUrl(new URL(req.url).searchParams.get("name") ?? "");
      return post(req);
    }
    if (req.method === "GET") {
      return opts.verifyGet
        ? opts.verifyGet(ourUrl)
        : json({ browser_download_url: ourUrl }, 200);
    }
    if (req.method === "DELETE") {
      return new Response(null, { status: opts.deleteStatus ?? 204 });
    }
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
}

test("ensureRelease returns the id of an existing release", async () => {
  const { impl, calls } = scriptedFetch((req) => {
    if (req.method === "GET" && req.url.includes("/releases/tags/_gh-imgup")) {
      return json(
        { id: 42, prerelease: true, draft: false, tag_name: "_gh-imgup" },
        200,
      );
    }
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  const id = await ensureRelease(TOKEN, REPO, "_gh-imgup", { fetchImpl: impl });
  assert.equal(id, 42);
  assert.equal(calls.length, 1);
});

test("ensureRelease creates a prerelease when none exists", async () => {
  const { impl, calls } = scriptedFetch((req) => {
    if (req.method === "GET") return json({}, 404);
    if (req.method === "POST")
      return json(
        { id: 99, prerelease: true, draft: false, tag_name: "_gh-imgup" },
        201,
      );
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  const id = await ensureRelease(TOKEN, REPO, "_gh-imgup", { fetchImpl: impl });
  assert.equal(id, 99);

  const post = calls.find((c) => c.method === "POST");
  assert.ok(post);
  const body = JSON.parse(post.init.body as string);
  assert.equal(body.tag_name, "_gh-imgup");
  assert.equal(body.prerelease, true);
  assert.equal(body.draft, false);
  assert.equal(body.generate_release_notes, false);
  assert.match(body.name, /do not delete/);
});

test("ensureRelease retries the GET on a 422 already_exists race", async () => {
  let gets = 0;
  const { impl } = scriptedFetch((req) => {
    if (req.method === "GET") {
      gets += 1;
      return gets === 1
        ? json({}, 404)
        : json(
            { id: 7, prerelease: true, draft: false, tag_name: "_gh-imgup" },
            200,
          );
    }
    return json(
      { errors: [{ code: "already_exists", field: "tag_name" }] },
      422,
    );
  });
  const id = await ensureRelease(TOKEN, REPO, "_gh-imgup", { fetchImpl: impl });
  assert.equal(id, 7);
  assert.equal(gets, 2);
});

test("ensureRelease fails on a 422 that is not already_exists", async () => {
  const { impl } = scriptedFetch((req) => {
    if (req.method === "GET") return json({}, 404);
    return json({ errors: [{ code: "custom", message: "nope" }] }, 422);
  });
  await assert.rejects(
    () => ensureRelease(TOKEN, REPO, "_gh-imgup", { fetchImpl: impl }),
    /Create release failed: 422/,
  );
});

test("ensureRelease surfaces a sanitized scope hint on 403", async () => {
  const { impl } = scriptedFetch(() => json({ message: "Forbidden" }, 403));
  await assert.rejects(
    () => ensureRelease("ghp_SECRET", REPO, "_gh-imgup", { fetchImpl: impl }),
    (err: Error) => {
      assert.match(err.message, /Look up release failed: 403/);
      assert.match(err.message, /contents:write/);
      assert.doesNotMatch(err.message, /ghp_SECRET/);
      return true;
    },
  );
});

const dir = mkdtempSync(join(tmpdir(), "gh-imgup-release-"));
after(() => rmSync(dir, { recursive: true, force: true }));

function imageFixture(name: string, contents: string): ImageFile {
  const filepath = join(dir, name);
  writeFileSync(filepath, Buffer.from(contents));
  return {
    filepath,
    filename: name,
    mime: "image/png",
    size: contents.length,
    sha256: createHash("sha256").update(Buffer.from(contents)).digest("hex"),
  };
}

const sha256 = (s: string) =>
  createHash("sha256").update(Buffer.from(s)).digest("hex");

test("uploadAsset uploads, verifies the digest, and returns the result", async () => {
  const file = imageFixture("shot.png", "PNGDATA");
  const digest = `sha256:${sha256("PNGDATA")}`;
  const { impl, calls } = scriptedFetch((req) => {
    assert.equal(req.method, "POST");
    assert.match(req.url, /uploads\.github\.com/);
    return uploadOk(req, { digest }); // URL echoes our name (with the hex)
  });
  const result = await uploadAsset(TOKEN, REPO, 42, TAG, file, {
    fetchImpl: impl,
  });
  assert.equal(result.filename, "shot.png");
  assert.equal(result.repo, "o/r");
  assert.equal(result.digest, digest);
  assert.match(
    result.url,
    /^https:\/\/github\.com\/o\/r\/releases\/download\/_gh-imgup\/shot-[0-9a-f]{8}\.png$/,
  );
  // Collision-safe asset name + Content-Type are sent; no delete on success.
  assert.match(calls[0]?.url ?? "", /name=shot-[0-9a-f]{8}\.png$/);
  assert.equal(
    new Headers(calls[0]?.init.headers).get("Content-Type"),
    "image/png",
  );
  assert.ok(!calls.some((c) => c.method === "DELETE"));
});

test("uploadAsset deletes the asset and fails on a digest mismatch", async () => {
  const file = imageFixture("bad.png", "REALBYTES");
  const { impl, calls } = cleanupFetch((req) =>
    uploadOk(req, { id: 8, digest: `sha256:${"a".repeat(64)}` }),
  );
  await assert.rejects(
    () => uploadAsset(TOKEN, REPO, 42, TAG, file, { fetchImpl: impl }),
    /Integrity check failed for bad\.png/,
  );
  // Cleanup verifies the id is ours (GET) before deleting it (DELETE).
  assert.ok(
    calls.some(
      (c) => c.method === "GET" && c.url.endsWith("/releases/assets/8"),
    ),
  );
  assert.ok(
    calls.some(
      (c) => c.method === "DELETE" && c.url.endsWith("/releases/assets/8"),
    ),
  );
});

test("uploadAsset still deletes when GitHub renamed the asset (same URL, different name)", async () => {
  // GitHub can sanitize the stored filename, so the re-fetched `name` may differ
  // from the name we requested. The accepted browser_download_url already binds
  // the asset, so cleanup must NOT be blocked by a name mismatch.
  const file = imageFixture("renamed.png", "REALBYTES");
  const { impl, calls } = cleanupFetch(
    (req) => uploadOk(req, { id: 8, digest: `sha256:${"a".repeat(64)}` }),
    {
      verifyGet: (ourUrl) =>
        json(
          { browser_download_url: ourUrl, name: "sanitized-by-github.png" },
          200,
        ),
    },
  );
  await assert.rejects(
    () => uploadAsset(TOKEN, REPO, 42, TAG, file, { fetchImpl: impl }),
    /Integrity check failed for renamed\.png/,
  );
  assert.ok(
    calls.some(
      (c) => c.method === "DELETE" && c.url.endsWith("/releases/assets/8"),
    ),
  ); // exact URL matches → delete proceeds despite the renamed `name`
});

test("uploadAsset does not delete when the asset id isn't verifiably ours", async () => {
  // The 201 binds a correct hex URL but supplies id 8; the verify GET of id 8
  // returns a DIFFERENT asset's URL, so the id isn't provably ours. We must NOT
  // delete by it (data-loss risk) — warn about an orphan.
  const file = imageFixture("unboundid.png", "REALBYTES");
  const warnings: string[] = [];
  const { impl, calls } = cleanupFetch(
    (req) => uploadOk(req, { id: 8, digest: `sha256:${"a".repeat(64)}` }),
    {
      verifyGet: () =>
        json({ browser_download_url: assetUrl("other-00000000.png") }, 200),
    },
  );
  await assert.rejects(
    () =>
      uploadAsset(TOKEN, REPO, 42, TAG, file, {
        fetchImpl: impl,
        warn: (m) => warnings.push(m),
      }),
    /Integrity check failed for unboundid\.png/,
  );
  assert.ok(
    calls.some(
      (c) => c.method === "GET" && c.url.endsWith("/releases/assets/8"),
    ),
  );
  assert.ok(!calls.some((c) => c.method === "DELETE")); // unverified id → never delete
  assert.match(warnings.join("\n"), /--cleanup/);
});

test("uploadAsset does not delete when verify GET only shares the upload hex", async () => {
  // The random hex is a useful upload binding, but not enough for a destructive
  // delete: a different same-repo/tag asset can contain the same substring.
  const file = imageFixture("samehex.png", "REALBYTES");
  const warnings: string[] = [];
  const { impl, calls } = cleanupFetch(
    (req) => uploadOk(req, { id: 8, digest: `sha256:${"a".repeat(64)}` }),
    {
      verifyGet: (ourUrl) => {
        const hex = ourUrl.match(/[0-9a-f]{8}(?=\.png$)/)?.[0] ?? "00000000";
        return json(
          { browser_download_url: assetUrl(`unrelated-${hex}.png`) },
          200,
        );
      },
    },
  );
  await assert.rejects(
    () =>
      uploadAsset(TOKEN, REPO, 42, TAG, file, {
        fetchImpl: impl,
        warn: (m) => warnings.push(m),
      }),
    /Integrity check failed for samehex\.png/,
  );
  assert.ok(!calls.some((c) => c.method === "DELETE")); // exact URL mismatch
  assert.match(warnings.join("\n"), /--cleanup/);
});

test("uploadAsset does not delete when the verify GET fails", async () => {
  // A non-200 verify GET means we can't confirm the id is ours — warn, no delete.
  const file = imageFixture("vgetfail.png", "REALBYTES");
  const warnings: string[] = [];
  const { impl, calls } = cleanupFetch(
    (req) => uploadOk(req, { id: 8, digest: `sha256:${"a".repeat(64)}` }),
    { verifyGet: () => json({ message: "not found" }, 404) },
  );
  await assert.rejects(
    () =>
      uploadAsset(TOKEN, REPO, 42, TAG, file, {
        fetchImpl: impl,
        warn: (m) => warnings.push(m),
      }),
    /Integrity check failed/,
  );
  assert.ok(!calls.some((c) => c.method === "DELETE"));
  assert.match(warnings.join("\n"), /--cleanup/);
});

test("uploadAsset rejects a 201 whose body lacks an id or download URL", async () => {
  const file = imageFixture("weird.png", "BYTES");
  // 201 but no browser_download_url — must fail, not return url: undefined.
  const missingUrl = scriptedFetch(() => json({ id: 5 }, 201));
  await assert.rejects(
    () =>
      uploadAsset(TOKEN, REPO, 42, TAG, file, { fetchImpl: missingUrl.impl }),
    /returned an unexpected response/,
  );
  // 201 but no id — needed for mismatch cleanup — must also fail.
  const missingId = scriptedFetch(() =>
    json({ browser_download_url: "https://x/w.png" }, 201),
  );
  await assert.rejects(
    () =>
      uploadAsset(TOKEN, REPO, 42, TAG, file, { fetchImpl: missingId.impl }),
    /returned an unexpected response/,
  );
});

test("uploadAsset rejects a download URL that isn't a usable github.com asset URL", async () => {
  const file = imageFixture("badurl.png", "BYTES");
  for (const url of [
    "", // empty
    "http://github.com/o/r/releases/download/x.png", // not https
    "ftp://github.com/o/r/releases/download/x.png", // not https
    "https://", // no host
    "https://evil.com/o/r/releases/download/x.png", // wrong host
    "https://github.com/evil/repo/releases/download/_gh-imgup/x.png", // different repo
    "https://github.com/o/r/blob/main/x.png", // wrong path shape
    "https://github.com/o/r/blob/main/releases/download/x.png", // marker not in segment position
    "https://github.com/o/r/releases/download/_gh-imgup", // missing asset segment
    "https://github.com/o/r/releases/download/_gh-imgup/a b.png", // raw space
    "https://github.com/o/r/releases/download/v1.0.0/a.png", // wrong tag (real release)
    "https://github.com/o/r/releases/download/_gh-imgup/before-00000000.png", // valid shape but not our upload (no matching hex)
    "https://user:SECRET@github.com/o/r/releases/download/_gh-imgup/a.png", // userinfo
    "https://github.com:8443/o/r/releases/download/_gh-imgup/a.png", // port
    "https://github.com/o/r/releases/download/_gh-imgup/a.png?jwt=SECRET", // query
    "https://github.com/o/r/releases/download/_gh-imgup/a.png#frag", // fragment
    "https://github.com/o/r/releases/download/_gh-imgup/a\u0085b.png", // C1 control (NEL)
    "https://github.com/o/r/releases/download/_gh-imgup/a\u2028b.png", // Unicode separator
  ]) {
    const { impl } = scriptedFetch(() =>
      json({ id: 5, browser_download_url: url }, 201),
    );
    await assert.rejects(
      () => uploadAsset(TOKEN, REPO, 42, TAG, file, { fetchImpl: impl }),
      /unexpected response/,
      `url=${JSON.stringify(url)}`,
    );
  }
});

test("uploadAsset sanitizes the token out of the digest-missing warning", async () => {
  // A filename containing the token must not leak it via the warning path.
  const file = imageFixture(`${TOKEN}.png`, "BYTES");
  const warnings: string[] = [];
  const { impl } = scriptedFetch((req) =>
    uploadOk(req, { id: 9, digest: null }),
  );
  await uploadAsset(TOKEN, REPO, 42, TAG, file, {
    fetchImpl: impl,
    warn: (m) => warnings.push(m),
  });
  assert.equal(warnings.length, 1);
  assert.doesNotMatch(warnings[0] ?? "", /ghp_TOK/);
  assert.match(warnings[0] ?? "", /\[REDACTED\]/);
});

test("uploadAsset sanitizes a file-read failure (token in the path)", async () => {
  // The file vanished after validation; the Node read error embeds the path,
  // which here contains the token — it must be redacted, and no upload attempted.
  const missing: ImageFile = {
    filepath: join(dir, `gone-${TOKEN}.png`),
    filename: `${TOKEN}.png`,
    mime: "image/png",
    size: 10,
    sha256: "0".repeat(64), // irrelevant: rejected before the digest compare
  };
  const { impl, calls } = scriptedFetch(() => {
    throw new Error("fetch should not be reached when the read fails");
  });
  await assert.rejects(
    () => uploadAsset(TOKEN, REPO, 42, TAG, missing, { fetchImpl: impl }),
    (err: Error) => {
      assert.doesNotMatch(err.message, /ghp_TOK/);
      return true;
    },
  );
  assert.equal(calls.length, 0);
});

test("uploadAsset read failure echoes the code, not the token-bearing filepath", async () => {
  // The token is percent-encoded in a DIRECTORY of the path (clean basename),
  // and the file is missing — the read error must not leak the encoded token.
  const missing: ImageFile = {
    filepath: join(dir, `${TOKEN.replace("_", "%5F")}-dir`, "shot.png"),
    filename: "shot.png",
    mime: "image/png",
    size: 10,
    sha256: "0".repeat(64), // irrelevant: rejected before the digest compare
  };
  const { impl, calls } = scriptedFetch(() => {
    throw new Error("fetch should not be reached when the read fails");
  });
  await assert.rejects(
    () => uploadAsset(TOKEN, REPO, 42, TAG, missing, { fetchImpl: impl }),
    (err: Error) => {
      assert.doesNotMatch(err.message, /ghp/i); // neither literal nor %5F form
      assert.match(err.message, /Cannot read shot\.png/);
      return true;
    },
  );
  assert.equal(calls.length, 0);
});

test("uploadAsset accepts a returned URL whose repo casing differs (case-insensitive)", async () => {
  // GitHub owner/repo are case-insensitive and the URL may use canonical casing;
  // a legit upload must not be falsely rejected as malformed.
  const file = imageFixture("casing.png", "BYTES");
  const digest = `sha256:${sha256("BYTES")}`;
  // Upload targets lower-case o/r; server returns canonical O/R casing.
  const { impl, calls } = scriptedFetch((req) =>
    uploadOk(req, { owner: "O", repo: "R", digest }),
  );
  const result = await uploadAsset(TOKEN, REPO, 42, TAG, file, {
    fetchImpl: impl,
  });
  assert.match(
    result.url,
    /^https:\/\/github\.com\/O\/R\/releases\/download\/_gh-imgup\/casing-[0-9a-f]{8}\.png$/,
  );
  assert.ok(!calls.some((c) => c.method === "DELETE"));
});

test("uploadAsset rejects (without deleting) a returned URL containing the token", async () => {
  // A tampered 201 embeds the token in the URL path; it must never be returned.
  // The URL didn't bind to our upload, so the id is untrusted — we warn about a
  // possible orphan rather than DELETE by an id we can't trust.
  const file = imageFixture("tokurl.png", "BYTES");
  const warnings: string[] = [];
  const { impl, calls } = scriptedFetch((req) => {
    if (req.method === "POST") {
      // Carry our hex (so it passes the binding) but inject the token into the
      // path, so the rejection is specifically the token check.
      const name = new URL(req.url).searchParams.get("name") ?? "";
      return json(
        {
          id: 8,
          browser_download_url: `https://github.com/o/r/releases/download/_gh-imgup/${TOKEN}.${name}`,
        },
        201,
      );
    }
    throw new Error(`unexpected ${req.method}`);
  });
  await assert.rejects(
    () =>
      uploadAsset(TOKEN, REPO, 42, TAG, file, {
        fetchImpl: impl,
        warn: (m) => warnings.push(m),
      }),
    (err: Error) => {
      assert.match(err.message, /unusable asset URL/);
      assert.doesNotMatch(err.message, /ghp_tok/i);
      return true;
    },
  );
  assert.ok(!calls.some((c) => c.method === "DELETE")); // never delete an untrusted id
  assert.match(warnings[0] ?? "", /--cleanup/);
});

test("uploadAsset keeps the token out of the asset name and returned filename", async () => {
  // A filename containing the token must not be published in the asset URL or
  // returned as the markdown alt.
  const file = imageFixture(`${TOKEN}.png`, "BYTES");
  const digest = `sha256:${sha256("BYTES")}`;
  const { impl, calls } = scriptedFetch((req) => uploadOk(req, { digest }));
  const result = await uploadAsset(TOKEN, REPO, 42, TAG, file, {
    fetchImpl: impl,
  });
  assert.doesNotMatch(calls[0]?.url ?? "", /ghp_tok/i); // asset name redacted
  assert.match(calls[0]?.url ?? "", /REDACTED/);
  assert.doesNotMatch(result.filename, /ghp_tok/i); // returned filename redacted
});

test("uploadAsset fails closed on a present non-string digest", async () => {
  const file = imageFixture("nonstrdig.png", "BYTES");
  const { impl, calls } = cleanupFetch((req) =>
    uploadOk(req, { id: 8, digest: false }),
  );
  await assert.rejects(
    () => uploadAsset(TOKEN, REPO, 42, TAG, file, { fetchImpl: impl }),
    /Integrity check failed/,
  );
  assert.ok(calls.some((c) => c.method === "DELETE"));
});

test("uploadAsset rejects an encoded-token filename before any file read", async () => {
  // The encoded-token check must run BEFORE readFileSync, so a missing file with
  // a token-encoding name fails on the token (not a read error that leaks it).
  // Also covers a malformed escape mixed in (decodeURIComponent is all-or-nothing).
  for (const name of [
    "ghp%5FTOK.png", // encoded only
    "bad%zz-ghp%5FTOK.png", // malformed escape + encoded token
    "ghp_TOK-ghp%5FTOK.png", // mixed literal + encoded (literal redacted, encoded remains)
  ]) {
    // filepath is irrelevant: the token check rejects before any read.
    const missing: ImageFile = {
      filepath: join(dir, "does-not-exist.png"),
      filename: name,
      mime: "image/png",
      size: 10,
      sha256: "0".repeat(64), // irrelevant: rejected before the digest compare
    };
    const { impl, calls } = scriptedFetch(() => {
      throw new Error("fetch should not be reached");
    });
    await assert.rejects(
      () => uploadAsset(TOKEN, REPO, 42, TAG, missing, { fetchImpl: impl }),
      (err: Error) => {
        assert.match(err.message, /encodes the token/);
        assert.doesNotMatch(err.message, /ghp_tok/i);
        return true;
      },
      name,
    );
    assert.equal(calls.length, 0);
  }
});

test("uploadAsset catches a token encoded past any fixed decode depth", async () => {
  // No arbitrary decode cap: a token encoded many layers deep (here 8, beyond
  // the old 6-pass limit) must still be detected and rejected before any read.
  const encodeLayers = (token: string, layers: number) => {
    let s = token.replace(/_/g, "%5F"); // layer 1: encode the underscore
    for (let i = 1; i < layers; i += 1) s = s.replace(/%/g, "%25"); // re-encode %
    return s;
  };
  const name = `${encodeLayers(TOKEN, 8)}.png`;
  const deep: ImageFile = {
    filepath: join(dir, "does-not-exist.png"),
    filename: name,
    mime: "image/png",
    size: 10,
    sha256: "0".repeat(64), // irrelevant: rejected before the digest compare
  };
  const { impl, calls } = scriptedFetch(() => {
    throw new Error("fetch should not be reached");
  });
  await assert.rejects(
    () => uploadAsset(TOKEN, REPO, 42, TAG, deep, { fetchImpl: impl }),
    (err: Error) => {
      assert.match(err.message, /encodes the token/);
      assert.doesNotMatch(err.message, /ghp/i);
      return true;
    },
    name,
  );
  assert.equal(calls.length, 0);
});

test("uploadAsset fails closed on a mismatched content_type or non-uploaded state", async () => {
  const file = imageFixture("statecheck.png", "BYTES");
  const digest = `sha256:${sha256("BYTES")}`;
  for (const extra of [
    { content_type: "application/octet-stream" },
    { state: "starter" },
  ]) {
    const { impl, calls } = cleanupFetch((req) => {
      const name = new URL(req.url).searchParams.get("name") ?? "";
      return json(
        { id: 8, browser_download_url: assetUrl(name), digest, ...extra },
        201,
      );
    });
    await assert.rejects(
      () => uploadAsset(TOKEN, REPO, 42, TAG, file, { fetchImpl: impl }),
      /unexpected response|not in the uploaded state|stored as/,
      JSON.stringify(extra),
    );
    assert.ok(calls.some((c) => c.method === "DELETE")); // verified → safe to clean up
  }
});

test("uploadAsset redacts an encoded token echoed from a response field", async () => {
  // content_type/state/size are response-controlled; an encoded token there
  // survives sanitize() (literal-only), so the echoed value must be redacted.
  const file = imageFixture("redact.png", "BYTES");
  const ENC = "ghp%5FTOK"; // decodes to the literal token
  const digest = `sha256:${sha256("BYTES")}`;
  const cases = [
    { extra: { content_type: ENC, digest }, where: "content_type" },
    {
      extra: { content_type: "image/png", state: ENC, digest },
      where: "state",
    },
    { extra: { digest: null, size: ENC }, where: "size" },
  ];
  for (const { extra, where } of cases) {
    const { impl, calls } = cleanupFetch((req) => {
      const name = new URL(req.url).searchParams.get("name") ?? "";
      return json(
        { id: 8, browser_download_url: assetUrl(name), ...extra },
        201,
      );
    });
    await assert.rejects(
      () => uploadAsset(TOKEN, REPO, 42, TAG, file, { fetchImpl: impl }),
      (err: Error) => {
        assert.doesNotMatch(err.message, /ghp/i); // neither literal nor %5F form
        assert.match(err.message, /\[REDACTED\]/);
        return true;
      },
      where,
    );
    // All three checks run after URL binding, so cleanup verifies and deletes.
    assert.ok(
      calls.some((c) => c.method === "DELETE"),
      where,
    );
  }
});

test("uploadAsset rejects a file that grew after validation, before reading it", async () => {
  // The on-disk file (5 bytes) is larger than validation recorded (2): the
  // pre-read statSync must reject it so a now-huge file is never read into
  // memory (TOCTOU / OOM guard), and no upload is attempted.
  const file = imageFixture("grown.png", "BYTES"); // actual 5 bytes
  file.size = 2; // validation recorded fewer bytes; the file has since grown
  const { impl, calls } = scriptedFetch(() => {
    throw new Error("fetch should not be reached");
  });
  await assert.rejects(
    () => uploadAsset(TOKEN, REPO, 42, TAG, file, { fetchImpl: impl }),
    /changed after validation \(2 → 5 bytes\)/,
  );
  assert.equal(calls.length, 0);
});

test("uploadAsset rejects a SAME-LENGTH content swap after validation", async () => {
  // The content-binding: validation fingerprinted "AAAAA"; the file is then
  // replaced with different bytes of the SAME length, which the size recheck
  // can't catch. uploadAsset must reject (digest != validation sha256) before
  // uploading unreviewed content — no fetch.
  const file = imageFixture("swap.png", "AAAAA"); // sha256 of AAAAA recorded
  writeFileSync(file.filepath, Buffer.from("BBBBB")); // same length, new bytes
  const { impl, calls } = scriptedFetch(() => {
    throw new Error("fetch should not be reached");
  });
  await assert.rejects(
    () => uploadAsset(TOKEN, REPO, 42, TAG, file, { fetchImpl: impl }),
    /changed after validation/,
  );
  assert.equal(calls.length, 0);
});

test("uploadAsset fails closed on a present-but-empty digest", async () => {
  // "" is a string but must not be treated as 'omitted' — verification skipped.
  const file = imageFixture("emptydig.png", "BYTES");
  const { impl, calls } = cleanupFetch((req) =>
    uploadOk(req, { id: 8, digest: "" }),
  );
  await assert.rejects(
    () => uploadAsset(TOKEN, REPO, 42, TAG, file, { fetchImpl: impl }),
    /Integrity check failed/,
  );
  assert.ok(calls.some((c) => c.method === "DELETE"));
});

test("releaseId and uploadAsset reject a non-positive-safe-integer id", async () => {
  const file = imageFixture("idcheck.png", "BYTES");
  for (const id of [0, -1, 1.5, 1e21]) {
    const up = scriptedFetch(() =>
      json({ id, browser_download_url: ASSET_URL, digest: null }, 201),
    );
    await assert.rejects(
      () => uploadAsset(TOKEN, REPO, 42, TAG, file, { fetchImpl: up.impl }),
      /unexpected response/,
      `asset id=${id}`,
    );
    const rel = scriptedFetch(() => json({ id, prerelease: true }, 200));
    await assert.rejects(
      () => ensureRelease(TOKEN, REPO, "_gh-imgup", { fetchImpl: rel.impl }),
      /no usable release id/,
      `release id=${id}`,
    );
  }
});

test("uploadAsset returns a canonical sha256 digest regardless of server casing", async () => {
  const file = imageFixture("canon.png", "DATA");
  const hex = sha256("DATA");
  const { impl } = scriptedFetch((req) =>
    uploadOk(req, { digest: `SHA256:${hex.toUpperCase()}` }),
  );
  const result = await uploadAsset(TOKEN, REPO, 42, TAG, file, {
    fetchImpl: impl,
  });
  assert.equal(result.digest, `sha256:${hex}`);
});

test("uploadAsset never echoes a response digest that contains the token", async () => {
  const file = imageFixture("tok.png", "BYTES");
  // A malformed digest carrying the token must not reach the error message.
  const { impl } = cleanupFetch((req) =>
    uploadOk(req, { id: 8, digest: `sha256:${TOKEN}` }),
  );
  await assert.rejects(
    () => uploadAsset(TOKEN, REPO, 42, TAG, file, { fetchImpl: impl }),
    (err: Error) => {
      assert.match(err.message, /Integrity check failed for tok\.png/);
      assert.doesNotMatch(err.message, /ghp_tok/i);
      return true;
    },
  );
});

test("uploadAsset warns but passes when the server omits a digest", async () => {
  const file = imageFixture("nodigest.png", "BYTES");
  const warnings: string[] = [];
  const { impl, calls } = scriptedFetch((req) =>
    uploadOk(req, { id: 9, digest: null }),
  );
  const result = await uploadAsset(TOKEN, REPO, 42, TAG, file, {
    fetchImpl: impl,
    warn: (m) => warnings.push(m),
  });
  assert.equal(result.digest, "");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /integrity not verified/);
  assert.ok(!calls.some((c) => c.method === "DELETE"));
});

test("deleteAsset resolves on 204 and throws otherwise", async () => {
  const ok = scriptedFetch(() => new Response(null, { status: 204 }));
  await deleteAsset(TOKEN, REPO, 5, { fetchImpl: ok.impl });
  assert.equal(ok.calls[0]?.method, "DELETE");

  const bad = scriptedFetch(() => json({ message: "boom" }, 500));
  await assert.rejects(
    () => deleteAsset(TOKEN, REPO, 5, { fetchImpl: bad.impl }),
    /Delete asset 5 failed: 500/,
  );
});

test("uploadAsset reports the integrity failure even when cleanup delete fails", async () => {
  // A failed delete must not mask the integrity error or swallow the signal:
  // the integrity error still wins and the orphaned asset is warned about.
  const file = imageFixture("tamper.png", "REALBYTES");
  const warnings: string[] = [];
  const { impl, calls } = cleanupFetch(
    (req) => uploadOk(req, { id: 8, digest: `sha256:${"b".repeat(64)}` }),
    { deleteStatus: 403 },
  );
  await assert.rejects(
    () =>
      uploadAsset(TOKEN, REPO, 42, TAG, file, {
        fetchImpl: impl,
        warn: (m) => warnings.push(m),
      }),
    /Integrity check failed for tamper\.png/,
  );
  assert.ok(calls.some((c) => c.method === "DELETE"));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /Could not delete asset 8/);
});

test("ensureRelease fails with context on a malformed or id-less 2xx body", async () => {
  const htmlBody = scriptedFetch(
    () => new Response("<html>not json</html>", { status: 200 }),
  );
  await assert.rejects(
    () => ensureRelease(TOKEN, REPO, "_gh-imgup", { fetchImpl: htmlBody.impl }),
    /Look up release returned no usable release id/,
  );

  const noId = scriptedFetch(() => json({ message: "ok but no id" }, 200));
  await assert.rejects(
    () => ensureRelease(TOKEN, REPO, "_gh-imgup", { fetchImpl: noId.impl }),
    /no usable release id/,
  );
});

test("ensureRelease rejects a tag that resolves to a non-prerelease or draft release", async () => {
  // A real published release, or a draft (whose asset URLs 404 by tag), must
  // not become the image bucket. A malformed/absent draft flag fails closed too:
  // draft must be EXPLICITLY false, not merely "not true".
  for (const release of [
    { id: 42, prerelease: false, draft: false, tag_name: "_gh-imgup" },
    { id: 42, prerelease: true, draft: true, tag_name: "_gh-imgup" },
    { id: 42, prerelease: true, draft: "false", tag_name: "_gh-imgup" }, // string, not bool
    { id: 42, prerelease: true, tag_name: "_gh-imgup" }, // draft omitted
  ]) {
    const { impl } = scriptedFetch(() => json(release, 200));
    await assert.rejects(
      () => ensureRelease(TOKEN, REPO, "_gh-imgup", { fetchImpl: impl }),
      /must be a non-draft prerelease; refusing to use it/,
      JSON.stringify(release),
    );
  }
});

test("apiError sanitizes the body before truncating (token can't straddle the cutoff)", async () => {
  // Place a realistic token across the 500-char truncation boundary; slicing
  // before sanitizing would leak a token fragment.
  const longToken = `ghp_${"S".repeat(36)}`;
  const body = `${"x".repeat(480)}${longToken}z`;
  const { impl } = scriptedFetch(() => new Response(body, { status: 500 }));
  await assert.rejects(
    () => deleteAsset(longToken, REPO, 5, { fetchImpl: impl }),
    (err: Error) => {
      assert.doesNotMatch(err.message, /SSSSS/); // no secret fragment survives
      assert.match(err.message, /\[REDACTED\]/);
      return true;
    },
  );
});

test("apiError redacts an encoded token in the response body", async () => {
  // The error body carries an encoded token; sanitize() strips only the literal
  // form, so the decode-aware redaction must catch it before it reaches stderr.
  const body = `request failed for ghp%5FTOK at upstream`;
  const { impl } = scriptedFetch(() => new Response(body, { status: 500 }));
  await assert.rejects(
    () => deleteAsset(TOKEN, REPO, 5, { fetchImpl: impl }),
    (err: Error) => {
      assert.match(err.message, /Delete asset 5 failed: 500/);
      assert.doesNotMatch(err.message, /ghp/i); // neither literal nor %5F form
      assert.match(err.message, /\[REDACTED\]/);
      return true;
    },
  );
});

test("apiError redacts a JSON \\u-escaped token in the response body", async () => {
  // A raw JSON error body escapes the underscore as _; res.text() returns
  // it literally (no JSON.parse), so literal sanitize() and the %XX decoder
  // both miss it — the \uXXXX decode in decodesToToken must catch it.
  const bs = String.fromCharCode(92); // backslash → build a literal unicode escape
  const body = `{"message":"ghp${bs}u005FTOK not allowed"}`; // ghp_TOK
  const { impl } = scriptedFetch(() => new Response(body, { status: 500 }));
  await assert.rejects(
    () => deleteAsset(TOKEN, REPO, 5, { fetchImpl: impl }),
    (err: Error) => {
      assert.match(err.message, /Delete asset 5 failed: 500/);
      assert.doesNotMatch(err.message, /ghp/i); // neither literal nor _ form
      assert.match(err.message, /\[REDACTED\]/);
      return true;
    },
  );
});

test("apiError redacts an encoded token in the status text", async () => {
  // The reason phrase is response-controlled; an encoded token there must not
  // reach stderr via res.statusText (sanitize() only strips the literal form).
  const { impl } = scriptedFetch(
    () => new Response("nope", { status: 500, statusText: "ghp%5FTOK" }),
  );
  await assert.rejects(
    () => deleteAsset(TOKEN, REPO, 5, { fetchImpl: impl }),
    (err: Error) => {
      assert.match(err.message, /Delete asset 5 failed: 500/);
      assert.doesNotMatch(err.message, /ghp/i);
      assert.match(err.message, /\[REDACTED\]/);
      return true;
    },
  );
});

test("ensureRelease keeps the raw detail of a non-JSON 422 body", async () => {
  const { impl } = scriptedFetch((req) => {
    if (req.method === "GET") return json({}, 404);
    return new Response("upstream rate limited", { status: 422 });
  });
  await assert.rejects(
    () => ensureRelease(TOKEN, REPO, "_gh-imgup", { fetchImpl: impl }),
    (err: Error) => {
      assert.match(err.message, /Create release failed: 422/);
      assert.match(err.message, /upstream rate limited/);
      return true;
    },
  );
});
