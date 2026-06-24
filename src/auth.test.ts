import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authedFetch,
  BROAD_SCOPE_WARNING,
  resolveToken,
  sanitize,
} from "./auth.js";

test("resolveToken prefers a trimmed GITHUB_TOKEN", () => {
  const r = resolveToken({
    env: { GITHUB_TOKEN: "  ghp_env  " },
    readGhToken: () => "gho_should_be_ignored",
  });
  assert.deepEqual(r, { token: "ghp_env", source: "env" });
});

test("resolveToken falls back to a trimmed gh token when env is empty/whitespace", () => {
  for (const envToken of [undefined, "", "   "]) {
    const r = resolveToken({
      env: envToken === undefined ? {} : { GITHUB_TOKEN: envToken },
      readGhToken: () => "  gho_fallback  ",
    });
    assert.deepEqual(r, { token: "gho_fallback", source: "gh" });
  }
});

test("resolveToken throws with guidance when no token is available", () => {
  assert.throws(
    () => resolveToken({ env: {}, readGhToken: () => null }),
    /No GitHub token found/,
  );
  // gh present but blank counts as absent.
  assert.throws(
    () => resolveToken({ env: {}, readGhToken: () => "   " }),
    /No GitHub token found/,
  );
});

test("BROAD_SCOPE_WARNING names the gh fallback and ends with a newline", () => {
  assert.match(BROAD_SCOPE_WARNING, /gh CLI token/);
  assert.ok(BROAD_SCOPE_WARNING.endsWith("\n"));
});

test("sanitize redacts the exact token, including inside a Bearer header", () => {
  assert.equal(
    sanitize("ghp_SECRET", new Error("403 for ghp_SECRET")),
    "403 for [REDACTED]",
  );
  assert.equal(
    sanitize("ghp_SECRET", new Error("Authorization: Bearer ghp_SECRET")),
    "Authorization: Bearer [REDACTED]",
  );
  // Non-Error inputs are coerced.
  assert.equal(
    sanitize("ghp_SECRET", "raw ghp_SECRET string"),
    "raw [REDACTED] string",
  );
  // An empty token never blanks the whole message.
  assert.equal(
    sanitize("", new Error("nothing to redact")),
    "nothing to redact",
  );
});

/** A fetch stand-in that records its arguments and returns a fixed response. */
function recordingFetch(response: Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = ((url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return Promise.resolve(response);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

test("authedFetch adds auth, accept, and version headers", async () => {
  const { impl, calls } = recordingFetch(new Response("ok"));
  await authedFetch(
    "ghp_TOK",
    "https://api.github.com/repos/o/r/releases",
    { method: "POST" },
    impl,
  );
  assert.equal(calls.length, 1);
  const headers = calls[0]?.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer ghp_TOK");
  assert.equal(headers.Accept, "application/vnd.github+json");
  assert.equal(headers["X-GitHub-Api-Version"], "2022-11-28");
  assert.equal(calls[0]?.init.method, "POST");
});

test("authedFetch lets the caller add headers without dropping auth", async () => {
  const { impl, calls } = recordingFetch(new Response("ok"));
  await authedFetch(
    "ghp_TOK",
    "https://uploads.github.com/repos/o/r/releases/1/assets?name=x.png",
    { method: "POST", headers: { "Content-Type": "image/png" } },
    impl,
  );
  const headers = calls[0]?.init.headers as Record<string, string>;
  assert.equal(headers["Content-Type"], "image/png");
  assert.equal(headers.Authorization, "Bearer ghp_TOK");
});

test("authedFetch returns the underlying response on success", async () => {
  const response = new Response("body", { status: 201 });
  const { impl } = recordingFetch(response);
  const got = await authedFetch("t", "https://api.github.com/x", {}, impl);
  assert.equal(got, response);
});

test("authedFetch refuses non-GitHub hosts and never calls fetch", async () => {
  const { impl, calls } = recordingFetch(new Response("ok"));
  for (const url of [
    "https://evil.com/x",
    "https://api.github.com.evil.com/x",
    "https://api.github.com:443@evil.com/x",
  ]) {
    await assert.rejects(
      () => authedFetch("t", url, {}, impl),
      /non-GitHub host/,
      url,
    );
  }
  assert.equal(calls.length, 0);
});

test("authedFetch sanitizes the token out of a network error", async () => {
  const throwing = ((_url: string | URL, _init?: RequestInit) => {
    return Promise.reject(new Error("connect failed using ghp_LEAK"));
  }) as unknown as typeof fetch;
  await assert.rejects(
    () => authedFetch("ghp_LEAK", "https://api.github.com/x", {}, throwing),
    (err: Error) => {
      assert.doesNotMatch(err.message, /ghp_LEAK/);
      assert.match(err.message, /\[REDACTED\]/);
      return true;
    },
  );
});
