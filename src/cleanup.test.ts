import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanup } from "./cleanup.js";
import type { Repo } from "./validate.js";

const REPO: Repo = { owner: "o", name: "r" };
const TOKEN = "ghp_TOK";
const TAG = "_gh-imgup";

interface Asset {
  id: number;
  name: string;
  url: string;
}
const asset = (id: number, name: string): Asset => ({
  id,
  name,
  url: `https://github.com/o/r/releases/download/_gh-imgup/${name}`,
});

interface FakeCall {
  url: string;
  method: string;
}
function scriptedFetch(handler: (req: FakeCall) => Response) {
  const calls: FakeCall[] = [];
  const impl = ((url: string | URL, init: RequestInit = {}) => {
    const req = { url: String(url), method: init.method ?? "GET" };
    calls.push(req);
    return Promise.resolve(handler(req));
  }) as unknown as typeof fetch;
  return { impl, calls };
}
const json = (
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

interface ApiOpts {
  release?: "missing";
  releaseObj?: object;
  /** The repo's numeric id (matches the id-form pagination links); null omits it. */
  repoId?: number | null;
  assets?: Asset[];
  assetPages?: Asset[][];
  issues?: string[];
  /** Multi-page issues — each entry is one page; pages link forward GitHub-style. */
  issuePages?: string[][];
  /** Raw items for the /issues page — to inject malformed shapes the typed helpers can't. */
  issuesRaw?: unknown[];
  issuesHeaders?: Record<string, string>;
  issueComments?: string[];
  pullComments?: string[];
  commitComments?: string[];
  releaseBodies?: string[];
  fail?: string;
  deleteStatus?: number;
  assetGet?: (id: number) => Response;
}
function api(opts: ApiOpts = {}) {
  const deleted: number[] = [];
  const bodies = (xs?: string[]) => (xs ?? []).map((b) => ({ body: b }));
  const { impl, calls } = scriptedFetch((req) => {
    const u = new URL(req.url);
    const p = u.pathname;
    if (opts.fail && req.url.includes(opts.fail))
      return json({ message: "boom" }, 500);
    if (req.method === "GET" && p.endsWith("/repos/o/r"))
      return json(opts.repoId === null ? {} : { id: opts.repoId ?? 123 }, 200);
    if (req.method === "GET" && p.includes("/releases/tags/")) {
      if (opts.release === "missing") return json({ message: "nf" }, 404);
      return json(
        opts.releaseObj ?? {
          id: 99,
          tag_name: "_gh-imgup",
          prerelease: true,
          draft: false,
        },
        200,
      );
    }
    if (req.method === "GET" && /\/releases\/\d+\/assets$/.test(p)) {
      const pages = opts.assetPages ?? [opts.assets ?? []];
      const page = Number(u.searchParams.get("page") ?? "1");
      const items = (pages[page - 1] ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        browser_download_url: a.url,
      }));
      const headers: Record<string, string> =
        page < pages.length
          ? {
              Link: `<${u.origin}${p}?per_page=100&page=${page + 1}>; rel="next"`,
            }
          : {};
      return json(items, 200, headers);
    }
    if (req.method === "GET" && p.endsWith("/issues")) {
      if (opts.issuePages) {
        const page = Number(u.searchParams.get("page") ?? "1");
        const items = bodies(opts.issuePages[page - 1] ?? []);
        // Mirror GitHub's real rel=next: the numeric /repositories/{id} path
        // form, the original query preserved, plus an opaque `after` cursor.
        const headers: Record<string, string> =
          page < opts.issuePages.length
            ? {
                Link: `<https://api.github.com/repositories/123/issues?state=all&per_page=100&after=CUR${page}&page=${page + 1}>; rel="next"`,
              }
            : {};
        return json(items, 200, headers);
      }
      return json(
        opts.issuesRaw ?? bodies(opts.issues),
        200,
        opts.issuesHeaders,
      );
    }
    if (req.method === "GET" && p.endsWith("/issues/comments"))
      return json(bodies(opts.issueComments), 200);
    if (req.method === "GET" && p.endsWith("/pulls/comments"))
      return json(bodies(opts.pullComments), 200);
    if (req.method === "GET" && p.endsWith("/repos/o/r/comments"))
      return json(bodies(opts.commitComments), 200);
    if (req.method === "GET" && p.endsWith("/releases"))
      return json(bodies(opts.releaseBodies), 200);
    if (req.method === "GET" && /\/releases\/assets\/\d+$/.test(p)) {
      const id = Number(p.split("/").pop());
      if (opts.assetGet) return opts.assetGet(id);
      const all = (opts.assetPages ?? [opts.assets ?? []]).flat();
      const found = all.find((x) => x.id === id);
      return found
        ? json({ browser_download_url: found.url, name: found.name }, 200)
        : json({ message: "nf" }, 404);
    }
    if (req.method === "DELETE" && /\/releases\/assets\/\d+$/.test(p)) {
      if ((opts.deleteStatus ?? 204) !== 204)
        return json({ message: "no" }, opts.deleteStatus ?? 500);
      deleted.push(Number(p.split("/").pop()));
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  return { impl, calls, deleted };
}

const yes = async () => true;
const no = async () => false;
const baseDeps = (impl: typeof fetch, extra: object = {}) => ({
  fetchImpl: impl,
  warn: () => {},
  isTTY: true,
  confirm: yes,
  ...extra,
});

test("does nothing when the release is missing", async () => {
  const a = api({ release: "missing" });
  const warns: string[] = [];
  await cleanup(
    TOKEN,
    REPO,
    TAG,
    baseDeps(a.impl, { warn: (m: string) => warns.push(m) }),
  );
  assert.match(warns.join(""), /nothing to clean up/);
  assert.deepEqual(a.deleted, []);
});

test("does nothing when the release has no assets", async () => {
  const a = api({ assets: [] });
  const warns: string[] = [];
  await cleanup(
    TOKEN,
    REPO,
    TAG,
    baseDeps(a.impl, { warn: (m: string) => warns.push(m) }),
  );
  assert.match(warns.join(""), /no assets/);
  assert.deepEqual(a.deleted, []);
});

test("deletes only the unreferenced assets after confirmation", async () => {
  const [A, B, C] = [
    asset(1, "a-11111111.png"),
    asset(2, "b-22222222.png"),
    asset(3, "c-33333333.png"),
  ];
  const a = api({
    assets: [A, B, C],
    issues: [`see ![x](${A.url})`], // A referenced by URL
    issueComments: ["uses b-22222222.png inline"], // B referenced by name
    // C referenced nowhere
  });
  const warns: string[] = [];
  await cleanup(
    TOKEN,
    REPO,
    TAG,
    baseDeps(a.impl, { warn: (m: string) => warns.push(m) }),
  );
  assert.deepEqual(a.deleted, [3]); // only C
  assert.match(warns.join(""), /3 asset\(s\); 2 referenced, 1 unreferenced/);
  assert.match(warns.join(""), /Deleted 1 asset/);
});

test("keeps assets referenced in any scanned surface", async () => {
  const assets = [
    asset(1, "issue.png"),
    asset(2, "icomment.png"),
    asset(3, "pcomment.png"),
    asset(4, "ccomment.png"),
    asset(5, "relbody.png"),
  ];
  const a = api({
    assets,
    issues: [assets[0]?.url ?? ""],
    issueComments: [assets[1]?.url ?? ""],
    pullComments: [assets[2]?.url ?? ""],
    commitComments: [assets[3]?.url ?? ""],
    releaseBodies: [assets[4]?.url ?? ""],
  });
  const warns: string[] = [];
  await cleanup(
    TOKEN,
    REPO,
    TAG,
    baseDeps(a.impl, { warn: (m: string) => warns.push(m) }),
  );
  assert.deepEqual(a.deleted, []);
  assert.match(warns.join(""), /Nothing to delete/);
});

test("keeps assets referenced via entity- or backslash-escaped URLs", async () => {
  // GitHub renders &#45; and \- to "-", so these bodies link to the real assets;
  // matching only the raw text would miss them and delete a live image.
  const bs = String.fromCharCode(92); // backslash
  const A = asset(1, "alpha-11111111.png");
  const B = asset(2, "beta-22222222.png");
  const entRef = `![a](${A.url.replace("alpha-", "alpha&#45;")})`; // &#45; -> -
  const bslRef = `![b](${B.url.replace("beta-", `beta${bs}-`)})`; // \- -> -
  const a = api({ assets: [A, B], issues: [entRef], issueComments: [bslRef] });
  await cleanup(TOKEN, REPO, TAG, baseDeps(a.impl));
  assert.deepEqual(a.deleted, []); // both referenced via the rendered form
});

test("keeps an asset referenced via a named entity (&period;)", async () => {
  // GitHub renders &period; to "." — a named ASCII-punctuation entity the scan
  // must decode, or it would delete the still-referenced image.
  const A = asset(1, "named-99999999.png");
  const ref = `![a](${A.url.replace(".png", "&period;png")})`;
  const a = api({ assets: [A], issues: [ref] });
  await cleanup(TOKEN, REPO, TAG, baseDeps(a.impl));
  assert.deepEqual(a.deleted, []); // referenced via the rendered form → kept
});

test("keeps an asset referenced via a multi-char ligature entity (&fjlig;)", async () => {
  // &fjlig; renders to "fj" — a multi-char ASCII named entity; missing it would
  // delete the still-referenced "fjord" asset (the reviewer's exact scenario).
  const A = asset(1, "fjord-12345678.png");
  const ref = `![a](${A.url.replace("fjord-", "&fjlig;ord-")})`;
  const a = api({ assets: [A], issues: [ref] });
  await cleanup(TOKEN, REPO, TAG, baseDeps(a.impl));
  assert.deepEqual(a.deleted, []); // referenced via the rendered form → kept
});

test("keeps an asset referenced by an equivalent percent-encoding (%5b vs %5B)", async () => {
  // GitHub serves the canonical uppercase escapes (%5B%5D); a body linking the
  // same asset with lowercase escapes resolves to it but isn't byte-identical.
  // Percent-folding the body must still match, or a live image would be deleted.
  const A = {
    id: 1,
    name: "shot[1]-12345678.png",
    url: "https://github.com/o/r/releases/download/_gh-imgup/shot%5B1%5D-12345678.png",
  };
  const lower =
    "![x](https://github.com/o/r/releases/download/_gh-imgup/shot%5b1%5d-12345678.png)";
  const a = api({ assets: [A], issues: [lower] });
  await cleanup(TOKEN, REPO, TAG, baseDeps(a.impl));
  assert.deepEqual(a.deleted, []); // matched via percent-folding → kept
});

test("keeps an asset referenced by a non-ASCII UTF-8 percent-encoding", async () => {
  // Asset names aren't ASCII-constrained: "café" yields URL segment caf%C3%A9.
  // A body linking it with lowercase UTF-8 escapes (caf%c3%a9) resolves to the
  // same asset; percent-folding must decode the multi-byte run or it's deleted.
  const A = {
    id: 1,
    name: "café-12345678.png",
    url: "https://github.com/o/r/releases/download/_gh-imgup/caf%C3%A9-12345678.png",
  };
  const lower =
    "![x](https://github.com/o/r/releases/download/_gh-imgup/caf%c3%a9-12345678.png)";
  const a = api({ assets: [A], issues: [lower] });
  await cleanup(TOKEN, REPO, TAG, baseDeps(a.impl));
  assert.deepEqual(a.deleted, []); // matched via UTF-8 percent-folding → kept
});

test("keeps a non-ASCII-named asset rather than risk a missed named-entity ref", async () => {
  // café-… could be referenced as caf&eacute;-… (a named entity we don't decode),
  // so fail toward keeping it and report it — while still deleting ASCII orphans.
  const ascii = asset(1, "plain-11111111.png"); // unreferenced, ASCII
  const uni = {
    id: 2,
    name: "café-22222222.png", // unreferenced, non-ASCII
    url: "https://github.com/o/r/releases/download/_gh-imgup/caf%C3%A9-22222222.png",
  };
  const warns: string[] = [];
  const a = api({ assets: [ascii, uni] }); // nothing references either
  await cleanup(
    TOKEN,
    REPO,
    TAG,
    baseDeps(a.impl, { warn: (m: string) => warns.push(m) }),
  );
  assert.deepEqual(a.deleted, [1]); // only the ASCII orphan deleted
  assert.match(warns.join(""), /1 kept \(non-ASCII name/);
  assert.match(warns.join(""), /Not deleting these non-ASCII-named/);
});

test("does not prompt or delete when nothing is unreferenced", async () => {
  const A = asset(1, "ref.png");
  const a = api({ assets: [A], issues: [A.url] });
  const confirm = async () => {
    throw new Error("confirm should not be called");
  };
  await cleanup(TOKEN, REPO, TAG, baseDeps(a.impl, { confirm }));
  assert.deepEqual(a.deleted, []);
});

test("refuses a release that is not our non-draft prerelease", async () => {
  // A published (non-prerelease) release tagged _gh-imgup must not be touched —
  // same validation as the upload path; no assets are listed or deleted.
  const a = api({
    releaseObj: {
      id: 99,
      tag_name: "_gh-imgup",
      prerelease: false,
      draft: false,
    },
    assets: [asset(1, "orphan.png")],
  });
  await assert.rejects(
    () => cleanup(TOKEN, REPO, TAG, baseDeps(a.impl)),
    /non-draft prerelease/,
  );
  assert.ok(!a.calls.some((c) => c.method === "DELETE"));
  assert.ok(!a.calls.some((c) => /\/releases\/\d+\/assets/.test(c.url)));
});

test("refuses a --tag that contains the token, before any network call", async () => {
  const a = api({ assets: [asset(1, "x.png")] });
  await assert.rejects(
    () => cleanup(TOKEN, REPO, `_${TOKEN}`, baseDeps(a.impl)),
    /contains the GitHub token/,
  );
  assert.equal(a.calls.length, 0); // refused before touching GitHub
});

test("aborts when an asset URL is not bound to this repo/tag (fail-safe)", async () => {
  // A stale/off-repo asset URL would be a bad match key (the real reference
  // wouldn't be found), so listAssets must abort rather than risk deleting it.
  const offRepo = {
    id: 1,
    name: "x.png",
    url: "https://github.com/other/repo/releases/download/_gh-imgup/x.png",
  };
  const a = api({ assets: [offRepo] });
  await assert.rejects(
    () => cleanup(TOKEN, REPO, TAG, baseDeps(a.impl)),
    /malformed; aborting/,
  );
  assert.deepEqual(a.deleted, []);
});

test("refuses to delete without a TTY", async () => {
  const A = asset(1, "orphan.png");
  const a = api({ assets: [A] });
  await assert.rejects(
    () => cleanup(TOKEN, REPO, TAG, baseDeps(a.impl, { isTTY: false })),
    (err: Error) => {
      assert.match(err.message, /not a TTY/);
      // Points at the per-asset command, and warns off whole-release deletion.
      assert.match(err.message, /gh release delete-asset/);
      assert.match(err.message, /whole release/);
      return true;
    },
  );
  assert.deepEqual(a.deleted, []);
});

test("aborts when an asset name does not match its URL filename (fail-safe)", async () => {
  // A tampered/stale page pairs one asset's URL with another's name. Using the
  // name as a match key could miss a filename reference and delete a live asset,
  // so a name/URL mismatch is malformed and aborts before any deletion.
  const decoupled = {
    id: 1,
    name: "claimed.png",
    url: "https://github.com/o/r/releases/download/_gh-imgup/actual.png",
  };
  const a = api({ assets: [decoupled] });
  await assert.rejects(
    () => cleanup(TOKEN, REPO, TAG, baseDeps(a.impl)),
    /malformed; aborting/,
  );
  assert.deepEqual(a.deleted, []);
});

test("accepts a percent-encoded asset name (space -> %20), not a mismatch", async () => {
  // GitHub URL-encodes the name into browser_download_url; an asset legitimately
  // named with a space must NOT be treated as a name/URL mismatch. The decoded
  // segment ("a b-...") equals the name, so cleanup proceeds normally.
  const A = {
    id: 1,
    name: "a b-11111111.png", // unreferenced; legitimately contains a space
    url: "https://github.com/o/r/releases/download/_gh-imgup/a%20b-11111111.png",
  };
  const a = api({ assets: [A] });
  await cleanup(TOKEN, REPO, TAG, baseDeps(a.impl));
  assert.deepEqual(a.deleted, [1]); // not false-aborted; orphan removed
});

test("skips deletion when the re-fetched name does not match", async () => {
  // Defense in depth: even if a list entry passed validation, the pre-delete
  // re-fetch must confirm BOTH url and name; a name mismatch skips, never deletes.
  const A = asset(1, "orphan.png"); // unreferenced
  const a = api({
    assets: [A],
    assetGet: () =>
      json({ browser_download_url: A.url, name: "different.png" }, 200),
  });
  const warns: string[] = [];
  await cleanup(
    TOKEN,
    REPO,
    TAG,
    baseDeps(a.impl, { warn: (m: string) => warns.push(m) }),
  );
  assert.deepEqual(a.deleted, []); // re-fetch name mismatch → skip
  assert.match(warns.join(""), /skipped/);
});

test("skips deletion when the re-fetched id no longer hosts the matched URL", async () => {
  // A mismatched/stale list entry: the id we'd delete now resolves to a
  // DIFFERENT asset URL — must skip, not delete a live asset by an unverified id.
  const A = asset(1, "orphan.png"); // unreferenced
  const a = api({
    assets: [A],
    assetGet: () =>
      json(
        {
          browser_download_url:
            "https://github.com/o/r/releases/download/_gh-imgup/different.png",
        },
        200,
      ),
  });
  const warns: string[] = [];
  await cleanup(
    TOKEN,
    REPO,
    TAG,
    baseDeps(a.impl, { warn: (m: string) => warns.push(m) }),
  );
  assert.deepEqual(a.deleted, []); // not deleted — id/URL mismatch
  assert.match(warns.join(""), /skipped/);
});

test("a declined confirmation deletes nothing", async () => {
  const A = asset(1, "orphan.png");
  const a = api({ assets: [A] });
  const warns: string[] = [];
  await cleanup(
    TOKEN,
    REPO,
    TAG,
    baseDeps(a.impl, { confirm: no, warn: (m: string) => warns.push(m) }),
  );
  assert.deepEqual(a.deleted, []);
  assert.match(warns.join(""), /Aborted/);
});

test("a scan failure aborts without deleting (fail-safe)", async () => {
  const A = asset(1, "orphan.png");
  const a = api({ assets: [A], fail: "/issues/comments" });
  await assert.rejects(() => cleanup(TOKEN, REPO, TAG, baseDeps(a.impl)));
  assert.deepEqual(a.deleted, []); // never deletes when the scan is incomplete
});

test("an off-target scan pagination link aborts without deleting", async () => {
  // A Link URL on api.github.com is not enough: if it jumps to another repo, the
  // target repo scan is incomplete and deletion must not start.
  const A = asset(1, "orphan.png");
  const a = api({
    assets: [A],
    issuesHeaders: {
      Link: '<https://api.github.com/repos/other/repo/issues?state=all&per_page=100&page=2>; rel="next"',
    },
  });
  await assert.rejects(
    () => cleanup(TOKEN, REPO, TAG, baseDeps(a.impl)),
    /unsafe pagination URL/,
  );
  assert.deepEqual(a.deleted, []);
});

test("a non-advancing scan pagination link aborts without deleting", async () => {
  const A = asset(1, "orphan.png");
  const a = api({
    assets: [A],
    issuesHeaders: {
      Link: '<https://api.github.com/repos/o/r/issues?state=all&per_page=100&page=1>; rel="next"',
    },
  });
  await assert.rejects(
    () => cleanup(TOKEN, REPO, TAG, baseDeps(a.impl)),
    /unsafe pagination URL/,
  );
  assert.deepEqual(a.deleted, []);
});

test("an id-form pagination link for a different repo id aborts", async () => {
  // /repositories/{id} is accepted only for THIS repo's id (123 here); a Link to
  // another repo's id would scan the wrong surface, so it must abort, not delete.
  const A = asset(1, "orphan.png");
  const a = api({
    assets: [A],
    issuesHeaders: {
      Link: '<https://api.github.com/repositories/999/issues?state=all&per_page=100&page=2>; rel="next"',
    },
  });
  await assert.rejects(
    () => cleanup(TOKEN, REPO, TAG, baseDeps(a.impl)),
    /unsafe pagination URL/,
  );
  assert.deepEqual(a.deleted, []);
});

test("a page-skipping pagination link aborts without deleting", async () => {
  // Forward movement isn't enough: a jump from page 1 to page 999 skips pages
  // 2-998, so a reference there would be missed. Pages must be contiguous.
  const A = asset(1, "orphan.png");
  const a = api({
    assets: [A],
    issuesHeaders: {
      Link: '<https://api.github.com/repos/o/r/issues?state=all&per_page=100&page=999>; rel="next"',
    },
  });
  await assert.rejects(
    () => cleanup(TOKEN, REPO, TAG, baseDeps(a.impl)),
    /unsafe pagination URL/,
  );
  assert.deepEqual(a.deleted, []);
});

test("aborts without deleting when the repository id can't be resolved", async () => {
  // The id-form pagination re-binding depends on knowing this repo's id; if the
  // lookup omits it, fail closed rather than scan unverifiable pages.
  const A = asset(1, "orphan.png");
  const a = api({ assets: [A], repoId: null });
  await assert.rejects(
    () => cleanup(TOKEN, REPO, TAG, baseDeps(a.impl)),
    /repository id/,
  );
  assert.deepEqual(a.deleted, []);
});

test("follows GitHub's real rel=next (numeric repo path + cursor) across pages", async () => {
  // GitHub returns pagination links in the /repositories/{id} form with an
  // `after` cursor; the scan must follow them, not reject them. Here the only
  // reference to the asset lives on page 2, so completing pagination keeps it.
  const A = asset(1, "orphan.png");
  const a = api({
    assets: [A],
    issuePages: [["nothing here"], [`see ![x](${A.url})`]],
  });
  await cleanup(TOKEN, REPO, TAG, baseDeps(a.impl));
  assert.deepEqual(a.deleted, []); // page-2 reference seen -> kept
  // Proves page 2 was actually fetched via the rewritten id-form Link.
  assert.ok(
    a.calls.some((c) => c.url.includes("/repositories/123/issues")),
    "expected the scan to follow the numeric-id rel=next link",
  );
});

test("deletes after completing a multi-page scan that finds no reference", async () => {
  // The asset is referenced on no page; the scan must traverse every page and
  // then reach the delete phase (the fix must not false-abort on real links).
  const A = asset(1, "orphan.png");
  const a = api({
    assets: [A],
    issuePages: [["unrelated"], ["still unrelated"]],
  });
  await cleanup(TOKEN, REPO, TAG, baseDeps(a.impl));
  assert.deepEqual(a.deleted, [1]);
});

test("aborts on a malformed scan item (non-string body)", async () => {
  // A truncated/garbled page item whose body is neither a string nor the blank
  // null could hide a reference; fail closed rather than risk deleting an asset.
  const A = asset(1, "orphan.png");
  const a = api({ assets: [A], issuesRaw: [{ body: 123 }] });
  await assert.rejects(
    () => cleanup(TOKEN, REPO, TAG, baseDeps(a.impl)),
    /malformed \(missing or non-string body\); aborting/,
  );
  assert.deepEqual(a.deleted, []);
});

test("aborts on a scan item missing its body field", async () => {
  const A = asset(1, "orphan.png");
  const a = api({ assets: [A], issuesRaw: [{ id: 7 }] }); // no body key at all
  await assert.rejects(
    () => cleanup(TOKEN, REPO, TAG, baseDeps(a.impl)),
    /missing or non-string body/,
  );
  assert.deepEqual(a.deleted, []);
});

test("aborts on a non-object scan item", async () => {
  const A = asset(1, "orphan.png");
  const a = api({ assets: [A], issuesRaw: [null, "not-an-object"] });
  await assert.rejects(
    () => cleanup(TOKEN, REPO, TAG, baseDeps(a.impl)),
    /missing or non-string body/,
  );
  assert.deepEqual(a.deleted, []);
});

test("treats a null body as empty, not malformed", async () => {
  // GitHub returns blank bodies as null — a genuinely empty item, not a
  // malformed one — so the scan continues and the orphan is still deleted.
  const A = asset(1, "orphan.png");
  const a = api({ assets: [A], issuesRaw: [{ body: null }] });
  await cleanup(TOKEN, REPO, TAG, baseDeps(a.impl));
  assert.deepEqual(a.deleted, [1]); // null body didn't abort; orphan removed
});

test("paginates the asset list", async () => {
  const A = asset(1, "p1.png");
  const B = asset(2, "p2.png");
  const a = api({ assetPages: [[A], [B]] }); // two pages, both unreferenced
  await cleanup(TOKEN, REPO, TAG, baseDeps(a.impl));
  assert.deepEqual(a.deleted.sort(), [1, 2]); // both pages' assets deleted
});

test("redacts an encoded token in an asset name before echoing", async () => {
  // A tampered assets list returns a name encoding the token (ghp_TOK); the
  // output must not leak it — sanitize() alone misses the percent-encoded form.
  // The URL segment is the name URL-encoded (the literal % becomes %25), so the
  // name<->URL binding still sees a well-formed entry (decoded segment === name).
  const A = {
    id: 1,
    name: "ghp%5FTOK.png", // unreferenced; %5F decodes to _ -> ghp_TOK
    url: "https://github.com/o/r/releases/download/_gh-imgup/ghp%255FTOK.png",
  };
  const a = api({ assets: [A] });
  const warns: string[] = [];
  await cleanup(
    TOKEN,
    REPO,
    TAG,
    baseDeps(a.impl, { warn: (m: string) => warns.push(m) }),
  );
  assert.deepEqual(a.deleted, [1]); // still cleaned up
  assert.doesNotMatch(warns.join(""), /ghp/i); // neither literal nor %5F form
  assert.match(warns.join(""), /\[REDACTED\]/);
});

test("the token never leaks on a scan error", async () => {
  const a = api({ assets: [asset(1, "x.png")], fail: "/issues?" });
  await assert.rejects(
    () => cleanup(TOKEN, REPO, TAG, baseDeps(a.impl)),
    (err: Error) => {
      assert.doesNotMatch(err.message, /ghp_TOK/);
      return true;
    },
  );
});
