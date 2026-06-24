import assert from "node:assert/strict";
import { test } from "node:test";
import { postComment } from "./github.js";
import type { Repo } from "./validate.js";

const REPO: Repo = { owner: "o", name: "r" };
const TOKEN = "ghp_TOK";

interface FakeCall {
  url: string;
  method: string;
  init: RequestInit;
}

/** A fetch stand-in driven by a per-call handler; records every request. */
function scriptedFetch(
  handler: (req: FakeCall) => Response | Promise<Response>,
) {
  const calls: FakeCall[] = [];
  const impl = ((url: string | URL, init: RequestInit = {}) => {
    const req: FakeCall = {
      url: String(url),
      method: init.method ?? "GET",
      init,
    };
    calls.push(req);
    return Promise.resolve(handler(req));
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const commentUrl = (n: number) =>
  `https://github.com/o/r/issues/${n}#issuecomment-1`;

test("postComment posts to the issues endpoint and returns the html_url", async () => {
  const { impl, calls } = scriptedFetch((req) => {
    assert.equal(req.method, "POST");
    assert.match(req.url, /api\.github\.com/);
    return json({ id: 1, html_url: commentUrl(42) }, 201);
  });
  const result = await postComment(TOKEN, REPO, 42, "![x](https://u)", {
    fetchImpl: impl,
  });
  assert.equal(result.number, 42);
  assert.equal(result.url, commentUrl(42));
  assert.equal(
    calls[0]?.url,
    "https://api.github.com/repos/o/r/issues/42/comments",
  );
  assert.equal(
    new Headers(calls[0]?.init.headers).get("Content-Type"),
    "application/json",
  );
  assert.deepEqual(JSON.parse(calls[0]?.init.body as string), {
    body: "![x](https://u)",
  });
});

test("postComment uses the same endpoint for a PR number", async () => {
  // PRs and issues share /issues/{n}/comments; the html_url may be a /pull/ URL.
  const { impl, calls } = scriptedFetch(() =>
    json({ html_url: "https://github.com/o/r/pull/7#issuecomment-9" }, 201),
  );
  const result = await postComment(TOKEN, REPO, 7, "body", { fetchImpl: impl });
  assert.equal(
    calls[0]?.url,
    "https://api.github.com/repos/o/r/issues/7/comments",
  );
  assert.match(result.url, /\/pull\/7#issuecomment-9$/);
});

test("postComment refuses a body containing the token (literal or encoded)", async () => {
  const bs = String.fromCharCode(92); // backslash, to build a \u escape literally
  for (const body of [
    `see ${TOKEN} here`, // literal
    `see ghp%5FTOK here`, // percent-encoded
    `see ghp${bs}u005FTOK here`, // JSON \u escape
    "see ghp&#95;TOK here", // HTML decimal entity → _ when rendered
    "see ghp&#x5F;TOK here", // HTML hex entity → _
    "see ghp&lowbar;TOK here", // named entity for _
    "see ghp&#00000095;TOK here", // zero-padded decimal ref
    "see ghp&#x000005F;TOK here", // zero-padded hex ref
    `see ghp${bs}_TOK here`, // Markdown backslash escape (\_ renders as _)
  ]) {
    const { impl, calls } = scriptedFetch(() => {
      throw new Error("fetch should not be reached");
    });
    await assert.rejects(
      () => postComment(TOKEN, REPO, 1, body, { fetchImpl: impl }),
      (err: Error) => {
        assert.match(err.message, /contains the GitHub token/);
        assert.doesNotMatch(err.message, /ghp/i);
        return true;
      },
      body,
    );
    assert.equal(calls.length, 0); // never sent to a public surface
  }
});

test("postComment raises a sanitized error with the issues:write hint on 403", async () => {
  const { impl } = scriptedFetch(() => json({ message: "Forbidden" }, 403));
  await assert.rejects(
    () => postComment("ghp_SECRET", REPO, 5, "body", { fetchImpl: impl }),
    (err: Error) => {
      assert.match(err.message, /Comment on #5 failed: 403/);
      assert.match(err.message, /issues:write/);
      assert.doesNotMatch(err.message, /ghp_SECRET/);
      return true;
    },
  );
});

test("postComment redacts an encoded token from a non-2xx body", async () => {
  const { impl } = scriptedFetch(
    () => new Response("blocked: ghp%5FTOK", { status: 422 }),
  );
  await assert.rejects(
    () => postComment(TOKEN, REPO, 5, "body", { fetchImpl: impl }),
    (err: Error) => {
      assert.match(err.message, /Comment on #5 failed: 422/);
      assert.doesNotMatch(err.message, /ghp/i);
      assert.match(err.message, /\[REDACTED\]/);
      return true;
    },
  );
});

test("postComment warns and returns url='' when the 201 body has no usable URL", async () => {
  const warnings: string[] = [];
  const { impl } = scriptedFetch(() => json({ id: 1 }, 201)); // no html_url
  const result = await postComment(TOKEN, REPO, 5, "body", {
    fetchImpl: impl,
    warn: (m) => warnings.push(m),
  });
  assert.equal(result.url, "");
  assert.equal(result.number, 5);
  assert.match(warnings[0] ?? "", /no usable URL/);
});

test("postComment never echoes a comment URL carrying the token", async () => {
  const warnings: string[] = [];
  const { impl } = scriptedFetch(() =>
    json({ html_url: "https://github.com/o/r/issues/5#ghp%5FTOK" }, 201),
  );
  const result = await postComment(TOKEN, REPO, 5, "body", {
    fetchImpl: impl,
    warn: (m) => warnings.push(m),
  });
  assert.equal(result.url, ""); // token-bearing URL dropped
  assert.match(warnings[0] ?? "", /no usable URL/);
});

test("postComment drops a non-github.com or credential-bearing comment URL", async () => {
  for (const html_url of [
    "http://github.com/o/r/issues/5#c", // not https
    "https://evil.com/o/r/issues/5#c", // wrong host
    "https://user:pw@github.com/o/r/issues/5#c", // credentials
    "https://github.com/o/r/issues/5?jwt=secret", // query
  ]) {
    const { impl } = scriptedFetch(() => json({ html_url }, 201));
    const result = await postComment(TOKEN, REPO, 5, "body", {
      fetchImpl: impl,
      warn: () => {},
    });
    assert.equal(result.url, "", html_url);
  }
});

test("postComment drops a comment URL with control chars or non-canonical form", async () => {
  const esc = String.fromCharCode(27); // ESC — terminal-escape / log-forging vector
  for (const html_url of [
    `https://github.com/o/r/issues/5#x${esc}forge`, // control char in fragment
    "https://github.com/o/r/../../evil/issues/5#c", // path traversal (non-canonical)
    "https://GitHub.com/o/r/issues/5#c", // mixed-case host (non-canonical)
  ]) {
    const { impl } = scriptedFetch(() => json({ html_url }, 201));
    const result = await postComment(TOKEN, REPO, 5, "body", {
      fetchImpl: impl,
      warn: () => {},
    });
    assert.equal(result.url, "", JSON.stringify(html_url));
  }
});

test("postComment drops a comment URL not bound to the target", async () => {
  // Posting to o/r #5: a 201 whose html_url is a canonical github.com URL but
  // points at another repo/issue or a non-comment page must NOT be reported.
  for (const html_url of [
    "https://github.com/other/repo/issues/5#issuecomment-1", // wrong repo
    "https://github.com/o/r/issues/999#issuecomment-1", // wrong number
    "https://github.com/o/r/blob/main/x#issuecomment-1", // non-comment page
    "https://github.com/o/r/issues/5", // missing #issuecomment fragment
    "https://github.com/o/r/issues/5#issuecomment-abc", // malformed fragment
  ]) {
    const { impl } = scriptedFetch(() => json({ html_url }, 201));
    const result = await postComment(TOKEN, REPO, 5, "body", {
      fetchImpl: impl,
      warn: () => {},
    });
    assert.equal(result.url, "", JSON.stringify(html_url));
  }
  // The matching target IS accepted (case-insensitive repo, /pull/ allowed).
  const ok = scriptedFetch(() =>
    json({ html_url: "https://github.com/O/R/pull/5#issuecomment-7" }, 201),
  );
  const result = await postComment(TOKEN, REPO, 5, "body", {
    fetchImpl: ok.impl,
  });
  assert.equal(result.url, "https://github.com/O/R/pull/5#issuecomment-7");
});
