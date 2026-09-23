import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const FILE_COUNT = 300;
const REPO = "o/r";
const TAG = "_gh-imgup";

const dir = mkdtempSync(join(tmpdir(), "gh-imgup-subprocess-"));
after(() => rmSync(dir, { recursive: true, force: true }));

/**
 * Source of a dependency-free ESM preload for `--import`: it stands in for
 * the two GitHub endpoints a plain `--json` upload run touches (the
 * release-by-tag lookup and the per-asset upload) by replacing
 * `globalThis.fetch` before the real dist/index.js loads. Anything
 * unexpected throws rather than falling through to the real network. Every
 * upload's request "name" — which embeds release.ts's random per-file hex —
 * is appended to logFile in arrival order, so the test can reconstruct the
 * exact expected stdout after the run instead of predicting that hex up
 * front. Built from an array of plain-quoted lines (not one outer template
 * literal) so the generated script's own template literals don't need
 * escaping.
 */
function preloadSource(logFile: string): string {
  // `D` splits every literal "${" the generated script needs across a
  // concatenation boundary, so no single string literal here contains that
  // sequence — otherwise biome's noTemplateCurlyInString (correctly, for an
  // ordinary string) flags each one as a likely forgotten template literal.
  const D = "$";
  return [
    'import { appendFileSync } from "node:fs";',
    'import { createHash } from "node:crypto";',
    "",
    `const REPO = ${JSON.stringify(REPO)};`,
    `const TAG = ${JSON.stringify(TAG)};`,
    `const LOG_FILE = ${JSON.stringify(logFile)};`,
    "",
    "globalThis.fetch = async (url, init = {}) => {",
    "  const u = new URL(String(url));",
    '  const method = init.method ?? "GET";',
    `  const releaseTagPath = \`/repos/${D}{REPO}/releases/tags/${D}{TAG}\`;`,
    '  if (method === "GET" && u.pathname === releaseTagPath) {',
    "    return new Response(",
    "      JSON.stringify({ id: 1, prerelease: true, draft: false, tag_name: TAG }),",
    '      { status: 200, headers: { "Content-Type": "application/json" } },',
    "    );",
    "  }",
    `  const uploadPath = \`/repos/${D}{REPO}/releases/1/assets\`;`,
    "  if (",
    '    method === "POST" &&',
    '    u.hostname === "uploads.github.com" &&',
    "    u.pathname === uploadPath",
    "  ) {",
    '    const name = u.searchParams.get("name") ?? "";',
    `    appendFileSync(LOG_FILE, \`${D}{name}\\n\`);`,
    '    const digest = createHash("sha256").update(init.body).digest("hex");',
    "    return new Response(",
    "      JSON.stringify({",
    "        id: 1,",
    `        browser_download_url: \`https://github.com/${D}{REPO}/releases/download/${D}{TAG}/${D}{name}\`,`,
    `        digest: \`sha256:${D}{digest}\`,`,
    "      }),",
    '      { status: 201, headers: { "Content-Type": "application/json" } },',
    "    );",
    "  }",
    `  throw new Error(\`unexpected offline fetch: ${D}{method} ${D}{u.href}\`);`,
    "};",
    "",
  ].join("\n");
}

test("a large --json run over piped stdout is not truncated by process.exit", () => {
  // This asserts only that the spawned CLI exits cleanly within its timeout
  // and produces complete, correct stdout on this one large-success path. It
  // does not prove run() releases every fetch/timer/stdin handle in general.
  const logFile = join(dir, "upload-names.log");
  writeFileSync(logFile, "");
  const preloadPath = join(dir, "fetch-preload.mjs");
  writeFileSync(preloadPath, preloadSource(logFile));

  const files: string[] = [];
  const contents: Buffer[] = [];
  for (let i = 0; i < FILE_COUNT; i += 1) {
    const filename = `img-${String(i).padStart(3, "0")}.png`;
    const content = Buffer.from(`fake-png-bytes-${i}`);
    writeFileSync(join(dir, filename), content);
    files.push(join(dir, filename));
    contents.push(content);
  }

  const distIndex = fileURLToPath(new URL("./index.js", import.meta.url));
  const result = spawnSync(
    process.execPath,
    ["--import", preloadPath, distIndex, ...files, "--repo", REPO, "--json"],
    {
      encoding: "utf8",
      timeout: 30_000,
      env: { ...process.env, GITHUB_TOKEN: "ghp_faketoken" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.signal, null, `stderr: ${result.stderr}`);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);

  const names = readFileSync(logFile, "utf8").split("\n").filter(Boolean);
  assert.equal(names.length, FILE_COUNT);

  const expected = names.map((name, i) => {
    const filename = `img-${String(i).padStart(3, "0")}.png`;
    const url = `https://github.com/${REPO}/releases/download/${TAG}/${name}`;
    const hash = createHash("sha256")
      .update(contents[i] ?? Buffer.alloc(0))
      .digest("hex");
    const digest = `sha256:${hash}`;
    const alt = filename.replace(/\.png$/, "");
    return { url, markdown: `![${alt}](${url})`, filename, repo: REPO, digest };
  });
  const expectedStdout = `${JSON.stringify(expected)}\n`;

  assert.equal(result.stdout, expectedStdout);
  assert.ok(
    Buffer.byteLength(result.stdout, "utf8") > 65536,
    `expected stdout over 65536 bytes, got ${Buffer.byteLength(result.stdout, "utf8")}`,
  );
});
