import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collapseControls,
  escapeAltText,
  renderInlineMarkdown,
} from "./markdown.js";

test("renderInlineMarkdown decodes numeric and named character references", () => {
  // hex and decimal, with and without leading zeros, all resolve to `_`
  assert.equal(renderInlineMarkdown("&#x5F;"), "_");
  assert.equal(renderInlineMarkdown("&#x000005F;"), "_");
  assert.equal(renderInlineMarkdown("&#95;"), "_");
  assert.equal(renderInlineMarkdown("&#00000095;"), "_");
  // named ASCII entities, including an alias pair and the one multi-char ligature
  assert.equal(renderInlineMarkdown("&lowbar;"), "_");
  assert.equal(renderInlineMarkdown("&lsqb;&rsqb;"), "[]");
  assert.equal(renderInlineMarkdown("&amp;"), "&");
  assert.equal(renderInlineMarkdown("&fjlig;"), "fj");
});

test("renderInlineMarkdown leaves non-ASCII and unknown references intact", () => {
  // expands to a non-ASCII char -> not in the table, left as text
  assert.equal(renderInlineMarkdown("&eacute;"), "&eacute;");
  assert.equal(renderInlineMarkdown("&notareal;"), "&notareal;");
  // a code point past U+10FFFF is left as text, not decoded
  assert.equal(renderInlineMarkdown("&#x110000;"), "&#x110000;");
});

test("renderInlineMarkdown does not resolve Object.prototype names as entities", () => {
  // On a plain-object entity map these resolve to inherited functions and
  // stringify ("function toString() { [native code] }"); GitHub renders them
  // literally, so the decoder must too.
  for (const name of [
    "toString",
    "constructor",
    "valueOf",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toLocaleString",
    "__proto__",
  ]) {
    assert.equal(renderInlineMarkdown(`&${name};`), `&${name};`);
  }
});

test("renderInlineMarkdown drops backslash escapes before ASCII punctuation only", () => {
  assert.equal(renderInlineMarkdown("\\_"), "_");
  assert.equal(renderInlineMarkdown("\\[\\]"), "[]");
  // a backslash before a non-punctuation char is preserved
  assert.equal(renderInlineMarkdown("\\a"), "\\a");
});

test("renderInlineMarkdown composes decoding then unescaping", () => {
  // an entity that renders to `_` and an escaped `_` both normalize the same way,
  // so a token hidden either way is revealed to a downstream `includes` check
  assert.equal(renderInlineMarkdown("a&#x5F;b\\_c"), "a_b_c");
});

test("escapeAltText backslash-escapes link-structural characters", () => {
  assert.equal(escapeAltText("a]b"), "a\\]b");
  assert.equal(escapeAltText("[x]"), "\\[x\\]");
  assert.equal(escapeAltText("a\\b"), "a\\\\b");
  assert.equal(escapeAltText("plain"), "plain");
});

test("escapeAltText collapses control chars and line/paragraph separators to one space", () => {
  // Build control chars from code points so the source carries no literal
  // control bytes (escapes in source can be decoded by edit tooling).
  const ch = (...codes: number[]) =>
    codes.map((c) => String.fromCharCode(c)).join("");
  assert.equal(escapeAltText(`a${ch(10)}b`), "a b"); // newline (C0)
  assert.equal(escapeAltText(`a${ch(0, 1)}b`), "a b"); // NUL+SOH run -> one space
  assert.equal(escapeAltText(`a${ch(0x7f)}b`), "a b"); // DEL
  assert.equal(escapeAltText(`a${ch(0x9b)}b`), "a b"); // C1 CSI (terminal-escape introducer)
  assert.equal(escapeAltText(`a${ch(0x85)}b`), "a b"); // C1 NEL
  assert.equal(escapeAltText(`a${ch(0x2028)}b`), "a b"); // line separator
  assert.equal(escapeAltText(`a${ch(0x2029)}b`), "a b"); // paragraph separator
});

test("collapseControls strips C0/DEL/C1 and separators, collapsing runs", () => {
  const ch = (...codes: number[]) =>
    codes.map((c) => String.fromCharCode(c)).join("");
  // DEL and the C1 block (incl. CSI U+009B) are the gap escapeAltText's old C0
  // -only collapse missed; a raw one would reach stdout/JSON/stderr/comments.
  assert.equal(collapseControls(`a${ch(0x7f)}b`), "a b");
  assert.equal(collapseControls(`a${ch(0x9b)}b`), "a b");
  assert.equal(collapseControls(`a${ch(0x80, 0x9f)}b`), "a b"); // C1 endpoints, run -> one space
  assert.equal(collapseControls(`a${ch(0x7f, 0x1b, 0x9b)}b`), "a b"); // mixed C0+DEL+C1 run
  // Printable ASCII and non-control Unicode are untouched.
  assert.equal(collapseControls("shot-1a2b3c4d.png"), "shot-1a2b3c4d.png");
  assert.equal(collapseControls("café"), "café");
});
