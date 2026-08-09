import assert from "node:assert/strict";
import { test } from "node:test";
import { apiIoDefaults } from "./deps.js";

test("apiIoDefaults passes through supplied fetchImpl and warn unchanged", () => {
  const fetchImpl = (() => Promise.resolve(new Response())) as typeof fetch;
  const calls: string[] = [];
  const warn = (m: string) => calls.push(m);
  const result = apiIoDefaults({ fetchImpl, warn });
  assert.equal(result.fetchImpl, fetchImpl);
  assert.equal(result.warn, warn);
  result.warn("hi");
  assert.deepEqual(calls, ["hi"]);
});

test("apiIoDefaults defaults fetchImpl to the global fetch", () => {
  const result = apiIoDefaults({});
  assert.equal(result.fetchImpl, fetch);
});

test("apiIoDefaults defaults warn to writing the message verbatim to stderr", () => {
  const original = process.stderr.write;
  const written: string[] = [];
  process.stderr.write = ((chunk: string) => {
    written.push(chunk);
    return true;
  }) as typeof process.stderr.write;
  try {
    const result = apiIoDefaults({});
    result.warn("⚠ something\n");
  } finally {
    process.stderr.write = original;
  }
  assert.deepEqual(written, ["⚠ something\n"]);
});
