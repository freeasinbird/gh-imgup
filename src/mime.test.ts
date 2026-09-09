import assert from "node:assert/strict";
import { test } from "node:test";
import { MIME, mimeFor } from "./mime.js";

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
