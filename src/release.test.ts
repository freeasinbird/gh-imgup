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

test("ensureRelease returns the id of an existing release", async () => {
  const { impl, calls } = scriptedFetch((req) => {
    if (req.method === "GET" && req.url.includes("/releases/tags/_gh-imgup")) {
      return json({ id: 42 }, 200);
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
    if (req.method === "POST") return json({ id: 99 }, 201);
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  const id = await ensureRelease(TOKEN, REPO, "_gh-imgup", { fetchImpl: impl });
  assert.equal(id, 99);

  const post = calls.find((c) => c.method === "POST");
  assert.ok(post);
  const body = JSON.parse(post.init.body as string);
  assert.equal(body.tag_name, "_gh-imgup");
  assert.equal(body.prerelease, true);
  assert.equal(body.generate_release_notes, false);
  assert.match(body.name, /do not delete/);
});

test("ensureRelease retries the GET on a 422 already_exists race", async () => {
  let gets = 0;
  const { impl } = scriptedFetch((req) => {
    if (req.method === "GET") {
      gets += 1;
      return gets === 1 ? json({}, 404) : json({ id: 7 }, 200);
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
  return { filepath, filename: name, mime: "image/png", size: contents.length };
}

const sha256 = (s: string) =>
  createHash("sha256").update(Buffer.from(s)).digest("hex");

test("uploadAsset uploads, verifies the digest, and returns the result", async () => {
  const file = imageFixture("shot.png", "PNGDATA");
  const digest = `sha256:${sha256("PNGDATA")}`;
  const { impl, calls } = scriptedFetch((req) => {
    assert.equal(req.method, "POST");
    assert.match(req.url, /uploads\.github\.com/);
    return json(
      {
        id: 5,
        browser_download_url:
          "https://github.com/o/r/releases/download/_gh-imgup/shot-a1b2c3d4.png",
        digest,
      },
      201,
    );
  });
  const result = await uploadAsset(TOKEN, REPO, 42, file, { fetchImpl: impl });
  assert.deepEqual(result, {
    filename: "shot.png",
    url: "https://github.com/o/r/releases/download/_gh-imgup/shot-a1b2c3d4.png",
    repo: "o/r",
    digest,
  });
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
  const { impl, calls } = scriptedFetch((req) => {
    if (req.method === "POST") {
      return json(
        {
          id: 8,
          browser_download_url: "https://x/bad.png",
          digest: "sha256:deadbeef",
        },
        201,
      );
    }
    if (req.method === "DELETE") return new Response(null, { status: 204 });
    throw new Error(`unexpected ${req.method}`);
  });
  await assert.rejects(
    () => uploadAsset(TOKEN, REPO, 42, file, { fetchImpl: impl }),
    /Integrity check failed for bad\.png/,
  );
  assert.ok(
    calls.some(
      (c) => c.method === "DELETE" && c.url.endsWith("/releases/assets/8"),
    ),
  );
});

test("uploadAsset warns but passes when the server omits a digest", async () => {
  const file = imageFixture("nodigest.png", "BYTES");
  const warnings: string[] = [];
  const { impl, calls } = scriptedFetch(() =>
    json(
      { id: 9, browser_download_url: "https://x/nd.png", digest: null },
      201,
    ),
  );
  const result = await uploadAsset(TOKEN, REPO, 42, file, {
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
