import assert from "node:assert/strict";
import { test } from "node:test";
import {
  apiError,
  decodesToToken,
  MAX_DETAIL,
  MAX_SCAN,
  redactBody,
  redactField,
} from "./apierr.js";

const TOKEN = "ghp_TOK";
const BS = String.fromCharCode(92); // backslash, to build \u escapes literally

test("decodesToToken catches literal, percent, and \\u escaped tokens", () => {
  assert.equal(decodesToToken(`x ${TOKEN} y`, TOKEN), true); // literal
  assert.equal(decodesToToken("x ghp%5FTOK y", TOKEN), true); // %XX
  assert.equal(decodesToToken(`x ghp${BS}u005FTOK y`, TOKEN), true); // \uXXXX
  assert.equal(decodesToToken("ghp%25255FTOK", TOKEN), true); // multiply-encoded
  assert.equal(decodesToToken("bad%zz-ghp%5FTOK", TOKEN), true); // malformed + encoded
});

test("decodesToToken does not false-positive on legit content", () => {
  assert.equal(decodesToToken("100%done and ghp_OTHER", TOKEN), false);
  assert.equal(decodesToToken(`a ${BS}u0041 b`, TOKEN), false); // A -> A
  assert.equal(decodesToToken("", TOKEN), false);
});

test("redactField redacts a token in any form, else echoes verbatim", () => {
  assert.equal(redactField("image/png", TOKEN), "image/png");
  assert.equal(redactField(`x ${TOKEN}`, TOKEN), "[REDACTED]");
  assert.equal(redactField("ghp%5FTOK", TOKEN), "[REDACTED]");
  assert.equal(redactField(12345, TOKEN), "12345"); // non-string coerced
});

test("redactBody redacts a token-bearing body and truncates to MAX_DETAIL", () => {
  assert.equal(redactBody(TOKEN, "all good"), "all good");
  assert.equal(redactBody(TOKEN, "oops ghp%5FTOK here"), "[REDACTED]");
  // sanitize-before-truncate: a literal token straddling the 500-char cutoff
  // (here positioned at 480..520) is fully redacted before slicing, so no token
  // fragment survives — and the [REDACTED] marker itself lands within the cutoff.
  const longToken = `ghp_${"S".repeat(36)}`; // 40 chars
  const body = `${"x".repeat(MAX_DETAIL - 20)}${longToken}z`;
  const out = redactBody(longToken, body);
  assert.ok(out.length <= MAX_DETAIL);
  assert.doesNotMatch(out, /SSSSS/);
  assert.match(out, /\[REDACTED\]/);
});

test("redactBody bounds the decode scan without weakening the echoed prefix", () => {
  // ~100KB of maximally nested percent escapes: each fixed-point pass peels
  // one layer, so an unbounded scan is O(n²) — this input made the old
  // full-body scan take minutes. It must complete promptly, and an encoded
  // token placed within the echoed prefix must still redact the whole body.
  const nested = `%${"25".repeat(50_000)}5A`;
  assert.equal(redactBody(TOKEN, `oops ghp%5FTOK ${nested}`), "[REDACTED]");
  const clean = redactBody(TOKEN, nested);
  assert.ok(clean.length <= MAX_DETAIL);
  assert.doesNotMatch(clean, /TOK/);

  // Collapse runs before the window/echo slice, so a control-char run can't
  // pull far-away body content (here, an encoded token) past the scan.
  const controls = String.fromCharCode(1).repeat(50_000);
  assert.equal(redactBody(TOKEN, `${controls}ghp%5FTOK`), "[REDACTED]");

  // Content beyond MAX_SCAN is not scanned — and can never be echoed either:
  // the echo is the first MAX_DETAIL chars of the same windowed text.
  const far = redactBody(TOKEN, `${"x".repeat(MAX_SCAN)}ghp%5FTOK`);
  assert.ok(far.length <= MAX_DETAIL);
  assert.doesNotMatch(far, /TOK/);
});

test("redactBody and redactField collapse control chars (no log forging)", () => {
  const nl = String.fromCharCode(10); // newline (C0)
  const bel = String.fromCharCode(7); // BEL (C0)
  const out = redactBody(TOKEN, `line1${nl}FORGED${bel}end`);
  assert.ok(!out.includes(nl) && !out.includes(bel)); // no raw control chars
  assert.equal(out, "line1 FORGED end");
  assert.equal(redactField(`a${nl}b`, TOKEN), "a b");

  // DEL and C1 controls (NEL U+0085, CSI U+009B) are terminal/log vectors too.
  const del = String.fromCharCode(0x7f);
  const nel = String.fromCharCode(0x85);
  const csi = String.fromCharCode(0x9b);
  const c1 = redactBody(TOKEN, `a${del}b${nel}c${csi}d`);
  assert.ok(![del, nel, csi].some((ch) => c1.includes(ch)));
  assert.equal(c1, "a b c d");
});

test("apiError builds a sanitized, scope-hinted message from a non-2xx response", async () => {
  const res = new Response("nope", { status: 403, statusText: "Forbidden" });
  const err = await apiError("ghp_SECRET", res, "Do thing", "issues:write");
  assert.match(err.message, /Do thing failed: 403 Forbidden/);
  assert.match(err.message, /issues:write/);
  assert.doesNotMatch(err.message, /ghp_SECRET/);
});

test("apiError redacts an encoded token in the status text", async () => {
  const res = new Response("x", { status: 500, statusText: "ghp%5FTOK" });
  const err = await apiError(TOKEN, res, "Do thing");
  assert.match(err.message, /Do thing failed: 500/);
  assert.doesNotMatch(err.message, /ghp/i);
  assert.match(err.message, /\[REDACTED\]/);
});

test("apiError adds no scope hint on a non-auth status", async () => {
  const res = new Response("teapot", { status: 418, statusText: "Teapot" });
  const err = await apiError(TOKEN, res, "Do thing");
  assert.doesNotMatch(err.message, /the token may be invalid/);
});
