import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { run, version } from "./index.js";

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

/**
 * A realistic GitHub API for the o/r repo: an existing prerelease, uploads that
 * echo the sent name and a digest matching the uploaded bytes, and comments that
 * return a valid html_url. `uploadStatus(i)` overrides the i-th upload's status.
 */
function ghApi(opts: { uploadStatus?: (i: number) => number } = {}) {
  let uploads = 0;
  return scriptedFetch((req) => {
    const u = new URL(req.url);
    if (req.method === "GET" && u.pathname.includes("/releases/tags/")) {
      return json(
        { id: 99, prerelease: true, draft: false, tag_name: "_gh-imgup" },
        200,
      );
    }
    if (req.method === "POST" && u.hostname === "uploads.github.com") {
      const i = uploads++;
      const status = opts.uploadStatus?.(i) ?? 201;
      if (status !== 201) return json({ message: "upload boom" }, status);
      const name = u.searchParams.get("name") ?? "";
      const body = req.init.body as unknown as Buffer;
      const digest = `sha256:${createHash("sha256").update(body).digest("hex")}`;
      return json(
        {
          id: 5 + i,
          browser_download_url: `https://github.com/o/r/releases/download/_gh-imgup/${name}`,
          digest,
        },
        201,
      );
    }
    if (req.method === "POST" && u.pathname.endsWith("/comments")) {
      const n = u.pathname.match(/issues\/(\d+)\/comments/)?.[1] ?? "0";
      return json(
        { html_url: `https://github.com/o/r/issues/${n}#issuecomment-1` },
        201,
      );
    }
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
}

const dir = mkdtempSync(join(tmpdir(), "gh-imgup-index-"));
after(() => rmSync(dir, { recursive: true, force: true }));

/** Write a real image file and return its path. */
function img(name: string, contents = "PNGDATA"): string {
  const p = join(dir, name);
  writeFileSync(p, Buffer.from(contents));
  return p;
}

const baseDeps = (impl: typeof fetch) => ({
  env: { GITHUB_TOKEN: TOKEN } as NodeJS.ProcessEnv,
  fetchImpl: impl,
  readGhToken: () => null,
  gitRemote: () => null,
});

test("--version prints the package version to stdout", async () => {
  const r = await run(["--version"]);
  assert.equal(r.exitCode, 0);
  assert.equal(r.stderr, "");
  assert.equal(r.stdout.trim(), version());
});

test("--help prints usage to stdout", async () => {
  const r = await run(["--help"]);
  assert.equal(r.exitCode, 0);
  assert.match(r.stdout, /^gh-imgup <file\.\.\.>/);
});

test("the published bin runs through a .bin symlink (npm/npx)", () => {
  // npm/npx link bin/gh-imgup -> dist/index.js; the entry guard must still fire
  // (process.argv[1] is the symlink, import.meta.url the real path). Running the
  // compiled module through a symlink must produce output, not a silent no-op.
  const realIndex = fileURLToPath(new URL("./index.js", import.meta.url));
  const link = join(dir, "gh-imgup-bin");
  symlinkSync(realIndex, link);
  const out = execFileSync(process.execPath, [link, "--version"], {
    encoding: "utf8",
  });
  assert.equal(out.trim(), version());
});

test("--cleanup is reported as not implemented (empty stdout)", async () => {
  const r = await run(["--cleanup"]);
  assert.equal(r.exitCode, 1);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /--cleanup is not yet implemented/);
});

test("argument errors fail with empty stdout and exit 1", async () => {
  const cases: Array<[string[], RegExp]> = [
    [["a.png", "--json", "--raw"], /mutually exclusive/],
    [["a.png", "--pr", "1", "--issue", "2"], /mutually exclusive/],
    [["--repo", "o/r"], /No image files/],
    [["a.png", "--bogus"], /Unknown option/],
    [["a.png", "--repo"], /requires a value/],
  ];
  for (const [argv, re] of cases) {
    const r = await run(argv);
    assert.equal(r.exitCode, 1, argv.join(" "));
    assert.equal(r.stdout, "", argv.join(" "));
    assert.match(r.stderr, re, argv.join(" "));
  }
});

test("happy path: uploads a file and prints markdown to stdout", async () => {
  const { impl, calls } = ghApi();
  const r = await run([img("shot.png"), "--repo", "o/r"], baseDeps(impl));
  assert.equal(r.exitCode, 0);
  assert.match(
    r.stdout,
    /^!\[shot\]\(https:\/\/github\.com\/o\/r\/releases\/download\/_gh-imgup\/shot-[0-9a-f]{8}\.png\)\n$/,
  );
  assert.match(r.stderr, /✓ Uploaded shot\.png/);
  assert.ok(!calls.some((c) => c.url.endsWith("/comments"))); // no comment without --pr/--issue
});

test("--raw prints a bare URL; --json prints a one-object array", async () => {
  const raw = await run(
    [img("r.png"), "--repo", "o/r", "--raw"],
    baseDeps(ghApi().impl),
  );
  assert.match(
    raw.stdout,
    /^https:\/\/github\.com\/o\/r\/releases\/download\/_gh-imgup\/r-[0-9a-f]{8}\.png\n$/,
  );

  const j = await run(
    [img("j.png"), "--repo", "o/r", "--json"],
    baseDeps(ghApi().impl),
  );
  const parsed = JSON.parse(j.stdout);
  assert.ok(Array.isArray(parsed) && parsed.length === 1);
  assert.equal(parsed[0].filename, "j.png");
  assert.equal(parsed[0].repo, "o/r");
  assert.match(parsed[0].digest, /^sha256:[0-9a-f]{64}$/);
});

test("repo is inferred from the git origin when --repo is omitted", async () => {
  const { impl, calls } = ghApi();
  const r = await run([img("inf.png")], {
    ...baseDeps(impl),
    gitRemote: () => "git@github.com:o/r.git",
  });
  assert.equal(r.exitCode, 0);
  assert.ok(calls.some((c) => c.url.includes("/repos/o/r/")));
});

test("missing token fails with guidance and no network", async () => {
  const { impl, calls } = ghApi();
  const r = await run([img("nt.png"), "--repo", "o/r"], {
    env: {} as NodeJS.ProcessEnv,
    fetchImpl: impl,
    readGhToken: () => null,
    gitRemote: () => null,
  });
  assert.equal(r.exitCode, 1);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /No GitHub token/);
  assert.equal(calls.length, 0);
});

test("a gh-sourced token emits the broad-scope warning", async () => {
  const r = await run([img("gh.png"), "--repo", "o/r"], {
    env: {} as NodeJS.ProcessEnv,
    fetchImpl: ghApi().impl,
    readGhToken: () => "ghp_FROMGH",
    gitRemote: () => null,
  });
  assert.equal(r.exitCode, 0);
  assert.match(r.stderr, /broad scope/i);
});

test("--pr posts a comment with the caption and image markdown", async () => {
  const { impl, calls } = ghApi();
  const r = await run(
    [
      img("a.png"),
      img("b.png"),
      "--repo",
      "o/r",
      "--pr",
      "42",
      "-m",
      "Before/after",
    ],
    baseDeps(impl),
  );
  assert.equal(r.exitCode, 0);
  const comment = calls.find((c) => c.url.endsWith("/issues/42/comments"));
  assert.ok(comment);
  const body = JSON.parse(comment.init.body as string).body as string;
  assert.match(body, /^Before\/after\n\n/); // caption first
  assert.match(body, /!\[a\]\(.*a-[0-9a-f]{8}\.png\)/);
  assert.match(body, /!\[b\]\(.*b-[0-9a-f]{8}\.png\)/);
  assert.match(r.stderr, /✓ Commented on #42/);
});

test("fail-fast: a later upload failure aborts with empty stdout, exit 1", async () => {
  const { impl } = ghApi({ uploadStatus: (i) => (i === 1 ? 500 : 201) });
  const r = await run(
    [img("ok.png"), img("fail.png"), "--repo", "o/r"],
    baseDeps(impl),
  );
  assert.equal(r.exitCode, 1);
  assert.equal(r.stdout, ""); // nothing partial on stdout
  assert.match(r.stderr, /✓ Uploaded ok\.png/); // the success is reported on stderr
  assert.match(r.stderr, /Upload fail\.png failed: 500/);
});

test("an invalid file fails before any network call", async () => {
  const { impl, calls } = ghApi();
  const r = await run([img("notimage.txt"), "--repo", "o/r"], baseDeps(impl));
  assert.equal(r.exitCode, 1);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /Unsupported file type/);
  assert.equal(calls.length, 0);
});

test("the token never reaches stderr on an API error", async () => {
  const { impl } = ghApi({ uploadStatus: () => 403 });
  const r = await run([img("leak.png"), "--repo", "o/r"], baseDeps(impl));
  assert.equal(r.exitCode, 1);
  assert.doesNotMatch(r.stderr, /ghp_TOK/);
});

test("a validation error never leaks an ENCODED token to stderr", async () => {
  // A missing file named ghp%5FTOK.png (token ghp_TOK) fails validation before
  // any network; the top-level catch must redact the encoded form, not just the
  // literal one.
  const { impl, calls } = ghApi();
  const r = await run(["ghp%5FTOK.png", "--repo", "o/r"], baseDeps(impl));
  assert.equal(r.exitCode, 1);
  assert.equal(r.stdout, "");
  assert.doesNotMatch(r.stderr, /ghp/i); // neither literal nor %5F form
  assert.equal(calls.length, 0); // failed before any network call
});
