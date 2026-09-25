import { createHash } from "node:crypto";
import { json, scriptedFetch } from "./test-support.test.js";

/**
 * `--import` preload for a real spawned `dist/index.js` process (see the
 * "large --json output" test in index.test.ts): patches the global `fetch`
 * with a scripted GitHub API double before the CLI module executes, so the
 * spawned process makes no real network call while still exercising the real
 * `isEntryPoint()`/`process.exitCode` path.
 *
 * `dist/*.test.js` is also glob-matched by `npm test`'s bare `node --test`
 * run; this file has no `test()` calls and is a no-op unless
 * GH_IMGUP_MOCK_FETCH is set, so that bare run does nothing here. The
 * `*.test.ts` source name keeps it out of the published package (see the
 * `!dist/**\/*.test.js` exclusion in package.json).
 */
if (process.env.GH_IMGUP_MOCK_FETCH === "1") {
  const { impl } = scriptedFetch((req) => {
    const u = new URL(req.url);
    if (req.method === "GET" && u.pathname.includes("/releases/tags/")) {
      return json(
        { id: 99, prerelease: true, draft: false, tag_name: "_gh-imgup" },
        200,
      );
    }
    if (req.method === "POST" && u.hostname === "uploads.github.com") {
      const name = u.searchParams.get("name") ?? "";
      const body = req.init.body as unknown as Buffer;
      const digest = `sha256:${createHash("sha256").update(body).digest("hex")}`;
      return json(
        {
          id: 1,
          browser_download_url: `https://github.com/o/r/releases/download/_gh-imgup/${name}`,
          digest,
        },
        201,
      );
    }
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  globalThis.fetch = impl;
}
