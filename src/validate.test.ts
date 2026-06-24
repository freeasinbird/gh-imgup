import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  parseGitRemoteUrl,
  validateImageFile,
  validateMaxSize,
  validateNumber,
  validateRepo,
  validateTag,
} from "./validate.js";

test("validateRepo accepts owner/repo and returns the parts", () => {
  assert.deepEqual(validateRepo("freeasinbird/gh-imgup"), {
    owner: "freeasinbird",
    name: "gh-imgup",
  });
});

test("validateRepo rejects malformed and dot components", () => {
  assert.throws(() => validateRepo("nope"), /Invalid repo/);
  assert.throws(() => validateRepo("a/b/c"), /Invalid repo/);
  assert.throws(() => validateRepo("../b"), /Invalid repo component/);
  assert.throws(() => validateRepo("a/.."), /Invalid repo component/);
});

test("validateTag requires the underscore prefix and a safe charset", () => {
  assert.equal(validateTag("_gh-imgup"), "_gh-imgup");
  assert.equal(validateTag("_imgup.test-1"), "_imgup.test-1");
  assert.throws(() => validateTag("v2.0.0"), /must start with "_"/);
  assert.throws(() => validateTag("_has space"), /invalid characters/);
});

test("validateNumber accepts positive ints, rejects the rest", () => {
  assert.equal(validateNumber("42"), 42);
  assert.equal(validateNumber(" 42 "), 42);
  assert.throws(() => validateNumber("0"), /Invalid issue\/PR number/);
  assert.throws(() => validateNumber("-1"), /Invalid issue\/PR number/);
  assert.throws(() => validateNumber("42abc"), /Invalid issue\/PR number/);
  assert.throws(() => validateNumber("3.5"), /Invalid issue\/PR number/);
});

test("validateMaxSize accepts positive numbers including fractions", () => {
  assert.equal(validateMaxSize("25"), 25);
  assert.equal(validateMaxSize("0.5"), 0.5);
  assert.throws(() => validateMaxSize("0"), /Invalid --max-size/);
  assert.throws(() => validateMaxSize("-5"), /Invalid --max-size/);
  assert.throws(() => validateMaxSize("abc"), /Invalid --max-size/);
  assert.throws(() => validateMaxSize(""), /Invalid --max-size/);
});

test("validateMaxSize rejects non-decimal numeric literals (parity with validateNumber)", () => {
  for (const bad of ["0x10", "1e3", "+5", "Infinity", "NaN", "5."]) {
    assert.throws(
      () => validateMaxSize(bad),
      /Invalid --max-size/,
      `bad: ${bad}`,
    );
  }
});

test("parseGitRemoteUrl handles https and ssh, stripping .git", () => {
  const want = { owner: "freeasinbird", name: "gh-imgup" };
  assert.deepEqual(
    parseGitRemoteUrl("https://github.com/freeasinbird/gh-imgup.git"),
    want,
  );
  assert.deepEqual(
    parseGitRemoteUrl("https://github.com/freeasinbird/gh-imgup"),
    want,
  );
  assert.deepEqual(
    parseGitRemoteUrl("https://github.com/freeasinbird/gh-imgup/"),
    want,
  );
  assert.deepEqual(
    parseGitRemoteUrl("git@github.com:freeasinbird/gh-imgup.git"),
    want,
  );
  assert.deepEqual(
    parseGitRemoteUrl("ssh://git@github.com/freeasinbird/gh-imgup.git"),
    want,
  );
});

test("parseGitRemoteUrl preserves dotted repo names (Pages repos)", () => {
  assert.deepEqual(
    parseGitRemoteUrl("https://github.com/octocat/octocat.github.io"),
    {
      owner: "octocat",
      name: "octocat.github.io",
    },
  );
});

test("parseGitRemoteUrl rejects host spoofs and non-github remotes", () => {
  assert.throws(
    () => parseGitRemoteUrl("https://evilgithub.com/o/r"),
    /Could not parse/,
  );
  assert.throws(
    () => parseGitRemoteUrl("https://github.com.evil.com/o/r"),
    /Could not parse/,
  );
  assert.throws(
    () => parseGitRemoteUrl("https://example.com/path/github.com/o/r"),
    /Could not parse/,
  );
  assert.throws(
    () => parseGitRemoteUrl("https://gitlab.com/o/r"),
    /Could not parse/,
  );
});

test("parseGitRemoteUrl rejects path-embedded @github.com on a non-github host", () => {
  // The host must be github.com structurally, not merely contain "@github.com"
  // somewhere in the path — otherwise inference uploads to the wrong real repo.
  assert.throws(
    () => parseGitRemoteUrl("https://example.com/foo@github.com/o/r.git"),
    /Could not parse/,
  );
  assert.throws(
    () => parseGitRemoteUrl("git@evil.com:foo@github.com/o/r.git"),
    /Could not parse/,
  );
});

test("parseGitRemoteUrl rejects non-git transports even on the github.com host", () => {
  // hostname === github.com is not enough; the scheme must be a real git
  // transport, or a file:// / ftp:// remote would infer an unrelated repo.
  assert.throws(
    () => parseGitRemoteUrl("file://github.com/o/r"),
    /Could not parse/,
  );
  assert.throws(
    () => parseGitRemoteUrl("ftp://github.com/o/r.git"),
    /Could not parse/,
  );
});

test("parseGitRemoteUrl accepts the git:// transport", () => {
  assert.deepEqual(parseGitRemoteUrl("git://github.com/octocat/hello.git"), {
    owner: "octocat",
    name: "hello",
  });
});

test("parseGitRemoteUrl accepts a mixed-case host in every transport", () => {
  // DNS hosts are case-insensitive; scp/ssh/git don't get lowercased by URL.
  const want = { owner: "o", name: "r" };
  assert.deepEqual(parseGitRemoteUrl("git@GitHub.com:o/r.git"), want);
  assert.deepEqual(parseGitRemoteUrl("https://GitHub.com/o/r.git"), want);
  assert.deepEqual(parseGitRemoteUrl("ssh://git@GITHUB.COM/o/r.git"), want);
  assert.deepEqual(parseGitRemoteUrl("git://GitHub.com/o/r.git"), want);
  // Case-folding doesn't let a non-github host through.
  assert.throws(
    () => parseGitRemoteUrl("git@GitLab.com:o/r"),
    /Could not parse/,
  );
});

test("parseGitRemoteUrl error redacts embedded credentials", () => {
  // git remote get-url can return a credentialed URL (Actions does); a parse
  // failure must never echo the secret, while still naming the host so the
  // error is useful. Covers simple, @-in-password, /-in-password, and scp forms.
  for (const remote of [
    "https://user:ghp_supersecret@ghe.example.com/o/r.git",
    "https://svc:p@ss-ghp_supersecret@ghe.example.com/o/r",
    "https://user:sec/ghp_supersecret@ghe.example.com/o/r.git",
    "user:ghp_supersecret@ghe.example.com:o/r.git",
  ]) {
    let message = "";
    try {
      parseGitRemoteUrl(remote);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    assert.notEqual(message, "", `expected ${remote} to throw`);
    assert.doesNotMatch(
      message,
      /ghp_supersecret/,
      `leaked secret for ${remote}`,
    );
    assert.match(message, /ghe\.example\.com/, `host missing for ${remote}`);
  }
});

test("parseGitRemoteUrl and validateRepo reject a .git component", () => {
  assert.throws(
    () => parseGitRemoteUrl("https://github.com/owner/.git"),
    /Invalid repo component/,
  );
  assert.throws(() => validateRepo("owner/.git"), /Invalid repo component/);
});

const dir = mkdtempSync(join(tmpdir(), "gh-imgup-validate-"));
after(() => rmSync(dir, { recursive: true, force: true }));

test("validateImageFile returns metadata for a valid image", () => {
  const file = join(dir, "shot.png");
  writeFileSync(file, Buffer.alloc(1024));
  assert.deepEqual(validateImageFile(file, 25 * 1024 * 1024), {
    filepath: file,
    filename: "shot.png",
    mime: "image/png",
    size: 1024,
  });
});

test("validateImageFile rejects missing, empty, oversized, and bad-type files", () => {
  assert.throws(
    () => validateImageFile(join(dir, "nope.png"), 1024),
    /File not found/,
  );

  const empty = join(dir, "empty.png");
  writeFileSync(empty, Buffer.alloc(0));
  assert.throws(() => validateImageFile(empty, 1024), /File is empty/);

  const big = join(dir, "big.png");
  writeFileSync(big, Buffer.alloc(2048));
  assert.throws(() => validateImageFile(big, 1024), /exceeds limit/);

  const txt = join(dir, "notes.txt");
  writeFileSync(txt, Buffer.alloc(16));
  assert.throws(() => validateImageFile(txt, 1024), /Unsupported file type/);
});

test("validateImageFile rejects a directory named like an image", () => {
  const subdir = join(dir, "adir.png");
  mkdirSync(subdir);
  assert.throws(() => validateImageFile(subdir, 1024), /Not a regular file/);
});

test("validateImageFile follows symlinks to a valid image", () => {
  const real = join(dir, "real.png");
  writeFileSync(real, Buffer.alloc(64));
  const link = join(dir, "link.png");
  symlinkSync(real, link);
  assert.equal(validateImageFile(link, 1024).mime, "image/png");
});
