import assert from "node:assert/strict";
import { test } from "node:test";
import { run, version } from "./index.js";

test("--version prints the package version to stdout", () => {
  const result = run(["--version"]);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+$/);
  assert.equal(result.stdout.trim(), version());
});

test("--help prints usage to stdout", () => {
  const result = run(["--help"]);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /^gh-imgup <file\.\.\.>/);
});

test("unknown invocation fails on stderr with empty stdout", () => {
  // Guards the output contract: errors never pollute machine-parseable stdout.
  const result = run(["screenshot.png"]);
  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /not yet implemented/);
});
