import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLinkHeader, rawNextLink } from "./link-header.js";

test("rawNextLink finds rel=next regardless of parameter order", () => {
  const u = "https://api.github.com/repos/o/r/issues?page=2";
  // rel="next" immediately after the target (the only shape the old regex handled)
  assert.equal(rawNextLink(`<${u}>; rel="next"`), u);
  // rel="next" AFTER another valid param — the regression: a positional regex
  // missed this and ended the scan a page early (delete-a-live-asset direction).
  assert.equal(rawNextLink(`<${u}>; type="application/json"; rel="next"`), u);
  // rel before another param, and multiple relation tokens in one rel value.
  assert.equal(rawNextLink(`<${u}>; rel="next"; type="x"`), u);
  assert.equal(rawNextLink(`<${u}>; rel="https://x next"`), u);
  // Relation types are case-insensitive.
  assert.equal(rawNextLink(`<${u}>; rel="NEXT"`), u);
  // A comma inside the target isn't a link-value delimiter.
  const c = "https://api.github.com/repos/o/r/issues?after=a,b&page=2";
  assert.equal(rawNextLink(`<${c}>; rel="next"`), c);
  // Picks the next link out of several link-values.
  assert.equal(
    rawNextLink(`<${u}>; rel="prev", <${u}>; rel="next", <x>; rel="last"`),
    u,
  );
});

test("rawNextLink returns null only when there is genuinely no next page", () => {
  assert.equal(rawNextLink(null), null);
  assert.equal(rawNextLink(""), null);
  assert.equal(rawNextLink("  "), null);
  // A legitimate last page carries prev/first/last links but no next.
  assert.equal(rawNextLink('<https://api.github.com/x>; rel="last"'), null);
});

test("rawNextLink fails closed (throws) on a malformed Link header", () => {
  // A present-but-unparseable header must NOT read as "no next page" — that would
  // silently truncate the scan. Each of these aborts cleanup via listPages.
  for (const bad of [
    "garbage-no-brackets",
    '<https://api.github.com/x; rel="next"', // unterminated target
    '<https://api.github.com/x>; rel="next', // unterminated quote
    '<a>; rel="next" <b>; rel="next"', // missing comma between link-values
    // Duplicate rel in one link-value: RFC 8288 keeps the first, but reinterpreting
    // `next; last` would skip a page — fail closed instead of guessing.
    '<https://api.github.com/x>; rel="next"; rel="last"',
    // Empty/valueless rel carries no relation token; treating it as "no next"
    // could end the scan early — fail closed.
    "<https://api.github.com/x>; rel",
    "<https://api.github.com/x>; rel=",
    '<https://api.github.com/x>; rel=""',
  ]) {
    assert.throws(() => rawNextLink(bad), /unparseable Link header/, bad);
  }
});

test("parseLinkHeader returns one entry per link-value with its full rel set", () => {
  // rawNextLink only ever surfaces the filtered "next" URI; parseLinkHeader's own
  // contract is the full per-link-value shape, including non-next relations.
  const prev = "https://api.github.com/repos/o/r/issues?page=1";
  const next = "https://api.github.com/repos/o/r/issues?page=3";
  const last = "https://api.github.com/repos/o/r/issues?page=9";
  assert.deepEqual(
    parseLinkHeader(
      `<${prev}>; rel="prev", <${next}>; rel="next", <${last}>; rel="last"`,
    ),
    [
      { uri: prev, rel: ["prev"] },
      { uri: next, rel: ["next"] },
      { uri: last, rel: ["last"] },
    ],
  );
});

test("parseLinkHeader splits a multi-token rel value into its individual tokens", () => {
  const u = "https://api.github.com/repos/o/r/issues?page=2";
  assert.deepEqual(parseLinkHeader(`<${u}>; rel="next last"`), [
    { uri: u, rel: ["next", "last"] },
  ]);
});

test("parseLinkHeader handles an escaped quote inside a non-rel quoted param", () => {
  // Exercises the header[i] === "\\" escape branch: no existing quoted value in
  // the corpus contains an escaped character before this case.
  const u = "https://x/y";
  assert.deepEqual(parseLinkHeader(`<${u}>; type="a\\"b"; rel="next"`), [
    { uri: u, rel: ["next"] },
  ]);
});

test("parseLinkHeader tolerates optional whitespace around ; and , delimiters", () => {
  const u = "u";
  const v = "v";
  assert.deepEqual(
    parseLinkHeader(`<${u}> ; rel = "next" , <${v}>; rel="prev"`),
    [
      { uri: u, rel: ["next"] },
      { uri: v, rel: ["prev"] },
    ],
  );
});
