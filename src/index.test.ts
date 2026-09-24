import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { run, version } from "./index.js";
import { json, scriptedFetch } from "./test-support.test.js";

const TOKEN = "ghp_TOK";

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
  assert.equal(r.stdout, `${version()}\n`);
});

test("--version fails clearly on manifest read/parse/shape failures", async () => {
  const secret = "SECRET_MANIFEST_TEXT_SHOULD_NOT_LEAK";
  const cases: Array<[string, () => string]> = [
    [
      "missing/unreadable manifest",
      () => {
        throw new Error(
          `ENOENT: no such file, open '/x/${secret}/package.json'`,
        );
      },
    ],
    ["malformed JSON", () => `{ not: json, ${secret}`],
    ["version field absent", () => JSON.stringify({ name: `${secret}` })],
    [
      "version field not a string",
      () => JSON.stringify({ version: 123, marker: secret }),
    ],
    [
      "version field empty",
      () => JSON.stringify({ version: "", marker: secret }),
    ],
    [
      "version field whitespace-only",
      () => JSON.stringify({ version: "   ", marker: secret }),
    ],
    [
      "version field contains a C0 control",
      () => JSON.stringify({ version: "0.1.3\nforged", marker: secret }),
    ],
    [
      "version field contains DEL",
      () =>
        JSON.stringify({
          version: `0.1.3${String.fromCodePoint(0x7f)}forged`,
          marker: secret,
        }),
    ],
    [
      "version field contains a C1 control",
      () =>
        JSON.stringify({
          version: `0.1.3${String.fromCodePoint(0x85)}forged`,
          marker: secret,
        }),
    ],
    [
      "version field contains a line separator",
      () =>
        JSON.stringify({
          version: `0.1.3${String.fromCodePoint(0x2028)}forged`,
          marker: secret,
        }),
    ],
  ];
  for (const [label, readManifest] of cases) {
    const r = await run(["--version"], { readManifest });
    assert.equal(r.exitCode, 1, label);
    assert.equal(r.stdout, "", label);
    assert.equal(r.stderr.split("\n").filter(Boolean).length, 1, label);
    assert.match(r.stderr, /^gh-imgup: .+\.\n$/, label);
    assert.doesNotMatch(r.stderr, new RegExp(secret), label);
  }
});

test("--help prints usage to stdout", async () => {
  const r = await run(["--help"]);
  assert.equal(r.exitCode, 0);
  assert.match(r.stdout, /^gh-imgup <file\.\.\.>/);
});

test("--help lists the full pre-upload review checklist, not just 'secrets'", async () => {
  // The CLI is the only review guidance that ships in the npm package (the
  // skill's SKILL.md is not bundled), so --help must carry the complete surface.
  const r = await run(["--help"]);
  assert.match(r.stdout, /API keys, tokens/);
  assert.match(r.stdout, /internal hostnames, IPs/);
  assert.match(r.stdout, /PII/);
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

test("parseArgs edge forms: --flag=value, --, lone -, -m=", async () => {
  // Inline --flag=value works end to end.
  const inline = await run(
    [img("i.png"), "--repo=o/r"],
    baseDeps(ghApi().impl),
  );
  assert.equal(inline.exitCode, 0);
  assert.match(inline.stdout, /github\.com\/o\/r\/releases/);

  // A boolean flag refuses an inline value.
  const noVal = await run([img("i.png"), "--json=x"], baseDeps(ghApi().impl));
  assert.equal(noVal.exitCode, 1);
  assert.equal(noVal.stdout, "");
  assert.match(noVal.stderr, /--json does not take a value/);

  // -- ends option parsing: what follows is a file, even when dash-prefixed.
  const dashed = await run(
    ["--repo", "o/r", "--", "--json"],
    baseDeps(ghApi().impl),
  );
  assert.equal(dashed.exitCode, 1);
  assert.match(dashed.stderr, /File not found: --json/);

  // A lone - is a positional (there is no stdin mode), not an option error.
  const stdin = await run(["-", "--repo", "o/r"], baseDeps(ghApi().impl));
  assert.equal(stdin.exitCode, 1);
  assert.match(stdin.stderr, /File not found: -/);

  // The inline = form is long-options only; -m=x is not recognized.
  const shortEq = await run(
    [img("i.png"), "-m=x", "--repo", "o/r"],
    baseDeps(ghApi().impl),
  );
  assert.equal(shortEq.exitCode, 1);
  assert.match(shortEq.stderr, /Unknown option: -m=x/);
});

test("--max-size is wired through run(): an oversize file is refused", async () => {
  const big = img("big.png", "x".repeat(2 * 1024 * 1024));
  const r = await run(
    [big, "--repo", "o/r", "--max-size", "1"],
    baseDeps(ghApi().impl),
  );
  assert.equal(r.exitCode, 1);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /is 2\.0MB, exceeds limit 1\.0MB/);
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
  assert.match(body, /^Before\\\/after\n\n/); // escaped caption first
  assert.match(body, /!\[a\]\(.*a-[0-9a-f]{8}\.png\)/);
  assert.match(body, /!\[b\]\(.*b-[0-9a-f]{8}\.png\)/);
  assert.match(r.stderr, /✓ Commented on #42/);
  assert.doesNotMatch(r.stderr, /Ignoring --message/); // a target was given
});

test("--message posts a Markdown payload as plain text", async () => {
  const { impl, calls } = ghApi();
  const r = await run(
    [
      img("caption.png"),
      "--repo",
      "o/r",
      "--issue",
      "7",
      "--message",
      "![tracking](https://example.com/pixel)",
    ],
    baseDeps(impl),
  );
  assert.equal(r.exitCode, 0);
  const comment = calls.find((c) => c.url.endsWith("/issues/7/comments"));
  assert.ok(comment);
  const body = JSON.parse(comment.init.body as string).body as string;
  assert.ok(
    body.startsWith(
      "\\!\\[tracking\\]\\(https\\:\\/\\/example\\.com\\/pixel\\)\n\n",
    ),
  );
  assert.doesNotMatch(body, /^!\[tracking\]\(https:\/\/example\.com\/pixel\)/);
  assert.match(body, /!\[caption\]\(.*caption-[0-9a-f]{8}\.png\)/);
});

test("--message without --pr/--issue warns it is ignored but still uploads", async () => {
  const { impl, calls } = ghApi();
  const r = await run(
    [img("m.png"), "--repo", "o/r", "-m", "unused caption"],
    baseDeps(impl),
  );
  assert.equal(r.exitCode, 0); // upload still succeeds
  assert.match(r.stdout, /!\[m\]\(.*m-[0-9a-f]{8}\.png\)/);
  assert.match(r.stderr, /Ignoring --message/);
  assert.ok(!calls.some((c) => c.url.endsWith("/comments"))); // no comment posted
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

test("control chars in a pre-upload validation error are collapsed", async () => {
  // validateImageFile runs before any upload and echoes the raw filepath (e.g.
  // "File not found: …"). Those pre-upload paths don't collapse controls
  // themselves, so the run() catch chokepoint must: a crafted filename carrying
  // a CSI (U+009B) or other control byte must not forge stderr/CI log lines
  // (invariants 3 and 7).
  const { impl, calls } = ghApi();
  const csiPath = join(dir, `ghost${String.fromCharCode(0x9b)}x.png`);
  const r = await run([csiPath, "--repo", "o/r"], baseDeps(impl));
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /File not found: /);
  assert.doesNotMatch(r.stderr, /\x9b/); // collapsed to a space, not the raw CSI
  assert.equal(calls.length, 0);
});

test("control collapsing cannot expose a token with internal spaces", async () => {
  const token = "secret value";
  for (const code of [9, 10, 0x9b]) {
    for (const prefix of ["secret", "%73ecret"]) {
      const { impl, calls } = ghApi();
      const path = join(dir, `${prefix}${String.fromCharCode(code)}value.png`);
      const r = await run([path, "--repo", "o/r"], {
        ...baseDeps(impl),
        env: { GITHUB_TOKEN: token },
      });
      assert.equal(r.exitCode, 1);
      assert.equal(
        r.stderr,
        "gh-imgup: [error redacted: it referenced the GitHub token]\n",
      );
      assert.equal(calls.length, 0);
    }
  }
});

test("the token never reaches stderr on an API error", async () => {
  const { impl } = ghApi({ uploadStatus: () => 403 });
  const r = await run([img("leak.png"), "--repo", "o/r"], baseDeps(impl));
  assert.equal(r.exitCode, 1);
  assert.doesNotMatch(r.stderr, /ghp_TOK/);
});

/** A minimal cleanup-capable GitHub API: one orphan asset, empty scan surfaces. */
function cleanupApi() {
  return scriptedFetch((req) => {
    const u = new URL(req.url);
    const p = u.pathname;
    if (req.method === "GET" && p.endsWith("/repos/o/r"))
      return json({ id: 99 }, 200);
    if (req.method === "GET" && p.includes("/releases/tags/")) {
      return json(
        { id: 99, tag_name: "_gh-imgup", prerelease: true, draft: false },
        200,
      );
    }
    if (req.method === "GET" && /\/releases\/\d+\/assets$/.test(p)) {
      return json(
        [
          {
            id: 7,
            name: "orphan.png",
            browser_download_url:
              "https://github.com/o/r/releases/download/_gh-imgup/orphan.png",
          },
        ],
        200,
      );
    }
    if (req.method === "GET" && /\/releases\/assets\/\d+$/.test(p)) {
      return json(
        {
          browser_download_url:
            "https://github.com/o/r/releases/download/_gh-imgup/orphan.png",
          name: "orphan.png",
        },
        200,
      );
    }
    if (
      req.method === "GET" &&
      (p.endsWith("/issues") ||
        p.endsWith("/comments") ||
        p.endsWith("/releases"))
    ) {
      return json([], 200);
    }
    if (req.method === "DELETE") return new Response(null, { status: 204 });
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
}

test("--cleanup refuses to delete without a TTY", async () => {
  const { impl, calls } = cleanupApi();
  const r = await run(["--cleanup", "--repo", "o/r"], {
    ...baseDeps(impl),
    isTTY: false,
    confirm: async () => true,
    warn: () => {},
  });
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /not a TTY/);
  assert.ok(!calls.some((c) => c.method === "DELETE"));
});

test("--cleanup deletes an unreferenced asset on confirmation", async () => {
  const { impl, calls } = cleanupApi();
  const warns: string[] = [];
  const r = await run(["--cleanup", "--repo", "o/r"], {
    ...baseDeps(impl),
    isTTY: true,
    confirm: async () => true,
    warn: (m) => warns.push(m),
  });
  assert.equal(r.exitCode, 0);
  assert.ok(
    calls.some(
      (c) => c.method === "DELETE" && c.url.endsWith("/releases/assets/7"),
    ),
  );
  assert.match(warns.join(""), /Deleted 1 asset/);
});

test("--cleanup with a positional file fails fast (no deletion)", async () => {
  // A stray --cleanup on an intended upload must not silently start deleting;
  // it fails before any token/network work.
  const { impl, calls } = cleanupApi();
  const r = await run(["shot.png", "--cleanup", "--repo", "o/r"], {
    ...baseDeps(impl),
    isTTY: true,
    confirm: async () => true,
    warn: () => {},
  });
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /--cleanup takes no upload inputs.*file arguments/);
  assert.equal(calls.length, 0); // failed fast — no release lookup, no DELETE
});

test("--cleanup with an upload-only flag fails fast", async () => {
  const { impl, calls } = cleanupApi();
  const r = await run(["--cleanup", "--json", "--repo", "o/r"], {
    ...baseDeps(impl),
    isTTY: true,
    confirm: async () => true,
    warn: () => {},
  });
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /--cleanup takes no upload inputs.*--json/);
  assert.equal(calls.length, 0);
});

test("a pre-resolution parse error never leaks the env token to stderr", async () => {
  // The token leaks if redaction waits for resolveToken: parseArgs runs first, so
  // an arg echoing the token (e.g. a mis-templated `--bad-<token>`) is sanitized
  // against the env-seeded token, not "". No file/network is touched.
  const r = await run([`--bad-${TOKEN}`], {
    env: { GITHUB_TOKEN: TOKEN } as NodeJS.ProcessEnv,
    readGhToken: () => null,
    gitRemote: () => null,
  });
  assert.equal(r.exitCode, 1);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /Unknown option/);
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

test("a large --json run flushes its full output through a real pipe before exit", () => {
  // Regression for the process.exit()-vs-pipe-drain race: process.exit()
  // tears down the process regardless of pending async stdout writes, so a
  // payload that overflows the OS pipe buffer can be silently truncated even
  // though the process reports exit 0. This spawns the real compiled entry
  // point (not run() in-process) so the real isEntryPoint() guard, the real
  // write, and the real exit path are all exercised end to end, with fetch
  // mocked offline via a `--import` preload.
  //
  // N=300 (~86KB of stdout) is not sufficient here: this sandbox's effective
  // pipe buffering before backpressure kicks in was measured at ~146KB, so
  // reverting the fix still passed a 300-file run without truncating.
  // N=2000 (~500KB+) was measured to reliably reproduce the pre-fix
  // truncation, giving a solid margin over that observed threshold; that is
  // the scale asserted here, not just the >65536-byte floor.
  const N = 2000;
  const flushDir = join(dir, "flush-large");
  mkdirSync(flushDir);
  // Pass basenames (with cwd: flushDir below), not fully qualified paths:
  // 2000 absolute paths would deterministically exceed Windows' 32,767-char
  // process command-line limit and fail npm test before the child even starts.
  const basenames: string[] = [];
  for (let i = 0; i < N; i++) {
    const name = `f${i}.png`;
    writeFileSync(join(flushDir, name), Buffer.from(`PNGDATA-${i}`));
    basenames.push(name);
  }

  // A minimal offline GitHub API: the one release lookup and one upload per
  // file that the upload flow makes for this scenario. Anything else throws,
  // so an unexpected call fails the run loudly instead of hanging or
  // silently mismatching.
  const preloadSrc = `import { createHash } from "node:crypto";

const TAG = "_gh-imgup";
let nextId = 1000;

globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const method = init.method ?? "GET";
  if (method === "GET" && u.pathname.includes("/releases/tags/")) {
    return new Response(
      JSON.stringify({ id: 99, prerelease: true, draft: false, tag_name: TAG }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
  if (method === "POST" && u.hostname === "uploads.github.com") {
    const name = u.searchParams.get("name") ?? "";
    const body = Buffer.isBuffer(init.body) ? init.body : Buffer.from(init.body ?? "");
    const digest = "sha256:" + createHash("sha256").update(body).digest("hex");
    return new Response(
      JSON.stringify({
        id: nextId++,
        browser_download_url: "https://github.com/o/r/releases/download/" + TAG + "/" + name,
        digest,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  }
  throw new Error("unexpected fetch " + method + " " + String(url));
};
`;
  const preload = join(flushDir, "mock-fetch.mjs");
  writeFileSync(preload, preloadSrc);

  const distIndex = fileURLToPath(new URL("./index.js", import.meta.url));
  const stdout = execFileSync(
    process.execPath,
    [
      "--import",
      pathToFileURL(preload).href,
      distIndex,
      ...basenames,
      "--repo",
      "o/r",
      "--json",
    ],
    {
      cwd: flushDir,
      env: { ...process.env, GITHUB_TOKEN: "ghp_SYNTHETIC_TEST_TOKEN" },
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 60_000,
      killSignal: "SIGKILL",
    },
  );

  assert.ok(
    Buffer.byteLength(stdout, "utf8") > 65536,
    `expected >65536 bytes, got ${Buffer.byteLength(stdout, "utf8")}`,
  );
  // The 65536-byte floor alone doesn't prove this run cleared the pipe's
  // actual buffering threshold (measured at ~146KB in this sandbox, well
  // above the commonly-assumed 64KiB) — assert a margin over that measured
  // value so this test can't pass on a run that never triggered backpressure.
  assert.ok(
    Buffer.byteLength(stdout, "utf8") > 200_000,
    `expected >200000 bytes (margin over the measured ~146KB threshold), got ${Buffer.byteLength(stdout, "utf8")}`,
  );
  const parsed = JSON.parse(stdout);
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed.length, N);
  parsed.forEach((entry: Record<string, unknown>, i: number) => {
    const expectedDigest = `sha256:${createHash("sha256")
      .update(Buffer.from(`PNGDATA-${i}`))
      .digest("hex")}`;
    assert.equal(entry.filename, `f${i}.png`, `filename[${i}]`);
    assert.equal(entry.repo, "o/r", `repo[${i}]`);
    assert.equal(entry.digest, expectedDigest, `digest[${i}]`);
    assert.match(
      entry.url as string,
      new RegExp(
        `^https://github\\.com/o/r/releases/download/_gh-imgup/f${i}-[0-9a-f]{8}\\.png$`,
      ),
      `url[${i}]`,
    );
  });
});
