import assert from "node:assert/strict";
import { test } from "node:test";
import { MIME, mimeFor, render, type UploadResult } from "./upload.js";

const one: UploadResult = {
  filename: "screenshot.png",
  url: "https://github.com/o/r/releases/download/_gh-imgup/screenshot-a1b2c3d4.png",
  repo: "o/r",
  digest: "sha256:abc123",
};
const two: UploadResult = {
  filename: "after.png",
  url: "https://github.com/o/r/releases/download/_gh-imgup/after-e5f6a7b8.png",
  repo: "o/r",
  digest: "sha256:def456",
};

test("MIME allowlist is exactly the five raster types, no svg", () => {
  assert.deepEqual(Object.keys(MIME).sort(), [
    ".gif",
    ".jpeg",
    ".jpg",
    ".png",
    ".webp",
  ]);
  assert.equal(MIME[".svg"], undefined);
});

test("mimeFor resolves by extension, case-insensitively", () => {
  assert.equal(mimeFor("a.png"), "image/png");
  assert.equal(mimeFor("A.PNG"), "image/png");
  assert.equal(mimeFor("photo.JPEG"), "image/jpeg");
  assert.equal(mimeFor("clip.webp"), "image/webp");
});

test("mimeFor rejects unsupported and extensionless names", () => {
  assert.equal(mimeFor("vector.svg"), undefined);
  assert.equal(mimeFor("notes.txt"), undefined);
  assert.equal(mimeFor("README"), undefined);
});

test("markdown render uses the original stem as alt text", () => {
  // Alt is the original stem ('screenshot'); the URL keeps the collision-safe name.
  assert.equal(
    render([one], "markdown"),
    "![screenshot](https://github.com/o/r/releases/download/_gh-imgup/screenshot-a1b2c3d4.png)\n",
  );
});

test("markdown render joins multiple images with newlines", () => {
  const out = render([one, two], "markdown");
  assert.equal(out.split("\n").filter(Boolean).length, 2);
  assert.match(out, /^!\[screenshot\]/);
  assert.match(out, /\n!\[after\]/);
  assert.ok(out.endsWith("\n"));
});

test("markdown render neutralizes a filename that injects a second image", () => {
  // A real filename can't contain "/", but it can contain ] [ ( ) — enough to
  // close the alt early and inject a SECOND image with an attacker-set target.
  // Payload: `x](https:evil)![y.png` would otherwise render two images.
  const malicious: UploadResult = { ...one, filename: "x](https:evil)![y.png" };
  const out = render([malicious], "markdown");
  // The breakout `]` and `[` are backslash-escaped...
  assert.match(out, /x\\\]/);
  assert.match(out, /!\\\[y/);
  // ...so no UNescaped `](https:evil` survives as a real Markdown destination.
  assert.doesNotMatch(out, /(?<!\\)\]\(https:evil/);
  // Exactly one image, and its (unescaped) destination is the real asset URL.
  assert.ok(out.endsWith(`](${one.url})\n`));
});

test("markdown render and json carry the same escaped markdown", () => {
  const malicious: UploadResult = { ...one, filename: "a]b.png" };
  const md = render([malicious], "markdown").trimEnd();
  const parsed = JSON.parse(render([malicious], "json"));
  assert.equal(parsed[0].markdown, md);
  assert.equal(md, `![a\\]b](${one.url})`);
});

test("markdown render angle-wraps a URL containing spaces or parens", () => {
  const spaced: UploadResult = { ...one, url: "https://x/a b(1).png" };
  assert.equal(
    render([spaced], "markdown"),
    "![screenshot](<https://x/a b(1).png>)\n",
  );
});

test("raw render is one bare URL per line", () => {
  assert.equal(render([one], "raw"), `${one.url}\n`);
  assert.equal(render([one, two], "raw"), `${one.url}\n${two.url}\n`);
});

test("json render is always an array, even for a single file", () => {
  const parsed = JSON.parse(render([one], "json"));
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0], {
    url: one.url,
    markdown: `![screenshot](${one.url})`,
    filename: "screenshot.png",
    repo: "o/r",
    digest: "sha256:abc123",
  });
});

test("json render carries one object per file for multiple files", () => {
  const parsed = JSON.parse(render([one, two], "json"));
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1].filename, "after.png");
});
