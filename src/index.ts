#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodesToToken } from "./apierr.js";
import { BROAD_SCOPE_WARNING, resolveToken, sanitize } from "./auth.js";
import { cleanup } from "./cleanup.js";
import { postComment } from "./github.js";
import { ensureRelease, uploadAsset } from "./release.js";
import { type OutputFormat, render, type UploadResult } from "./upload.js";
import {
  type ImageFile,
  parseGitRemoteUrl,
  type Repo,
  validateImageFile,
  validateMaxSize,
  validateNumber,
  validateRepo,
  validateTag,
} from "./validate.js";

const HELP = `gh-imgup <file...> [options]

Upload images to GitHub issues and PRs via the Release Assets API.

Options:
  --repo <owner/repo>   Target repository (default: inferred from git remote)
  --pr <number>         Comment on a pull request
  --issue <number>      Comment on an issue
  -m, --message <text>  Caption to include with the image(s)
  --json                JSON output to stdout
  --raw                 Raw URL(s) only
  --tag <name>          Release tag (default: _gh-imgup, must start with _)
  --max-size <MB>       Max file size in MB (default: 25)
  --cleanup             Interactively delete unreferenced assets
  -h, --help            Show help
  -v, --version         Show version

Environment:
  GITHUB_TOKEN          GitHub token with contents:write scope
                        (add issues:write for --pr/--issue).

Uploaded images are public on public repos (visible to anyone) and visible to
all collaborators on private repos, and persist until deleted. Before
uploading, review every image for:
  - API keys, tokens, passwords, session cookies, .env contents
  - internal hostnames, IPs, private URLs, infrastructure details
  - customer or personal data / PII: names, emails, account numbers
  - anything from a terminal, editor, devtools, or notification not meant
    to be shared
If an image contains any of these, don't upload it.
`;

const DEFAULT_TAG = "_gh-imgup";
const DEFAULT_MAX_SIZE_MB = "25";

/** Result of a CLI invocation. stdout is machine-parseable only; stderr is human-readable. */
export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Injectable dependencies for {@link run} (real defaults in production). */
export interface RunDeps {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  /** gh CLI token reader (auth fallback). */
  readGhToken?: () => string | null;
  /** `git remote get-url origin` reader, for repo inference. */
  gitRemote?: () => string | null;
  /** Interactive cleanup I/O (live stderr in production; injected for tests). */
  warn?: (message: string) => void;
  /** Whether stdin is a TTY — the --cleanup delete prompt is refused if not. */
  isTTY?: boolean;
  /** Confirm callback for the --cleanup delete prompt. */
  confirm?: (question: string) => Promise<boolean>;
}

/** The flags and positional files parsed from argv. */
interface ParsedArgs {
  files: string[];
  repo?: string;
  pr?: string;
  issue?: string;
  message?: string;
  tag?: string;
  maxSize?: string;
  json: boolean;
  raw: boolean;
  cleanup: boolean;
  help: boolean;
  version: boolean;
}

/** Read the package version from the manifest one directory above this module. */
export function version(): string {
  const pkgPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "package.json",
  );
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
  return pkg.version;
}

/**
 * Read `git remote get-url origin`, or null if git is absent / not a repo / no
 * origin. The second (and last) of the tool's two subprocess calls: array args
 * (no shell, no user input), 5s timeout, stderr discarded so git's own messages
 * never reach our output. The returned URL is parsed structurally by
 * parseGitRemoteUrl (which rejects non-github.com hosts and redacts credentials).
 */
function gitRemoteOrigin(): string | null {
  try {
    const out = execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const trimmed = out.trim();
    return trimmed === "" ? null : trimmed;
  } catch {
    return null;
  }
}

/**
 * Parse argv into flags and positional files. Supports `--flag value`,
 * `--flag=value`, the `-h/-v/-m` short forms, and `--` to end option parsing.
 * Unknown options and value flags missing their value are hard errors.
 */
function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    files: [],
    json: false,
    raw: false,
    cleanup: false,
    help: false,
    version: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const tok = argv[i] ?? "";
    if (tok === "--") {
      out.files.push(...argv.slice(i + 1));
      break;
    }
    let key = tok;
    let inlineVal: string | undefined;
    if (tok.startsWith("--") && tok.includes("=")) {
      const eq = tok.indexOf("=");
      key = tok.slice(0, eq);
      inlineVal = tok.slice(eq + 1);
    }
    const noValue = () => {
      if (inlineVal !== undefined) {
        throw new Error(`Option ${key} does not take a value`);
      }
    };
    const takeValue = (): string => {
      if (inlineVal !== undefined) return inlineVal;
      const next = argv[i + 1];
      if (next === undefined) throw new Error(`Option ${key} requires a value`);
      i += 1;
      return next;
    };
    switch (key) {
      case "-h":
      case "--help":
        noValue();
        out.help = true;
        break;
      case "-v":
      case "--version":
        noValue();
        out.version = true;
        break;
      case "--json":
        noValue();
        out.json = true;
        break;
      case "--raw":
        noValue();
        out.raw = true;
        break;
      case "--cleanup":
        noValue();
        out.cleanup = true;
        break;
      case "--repo":
        out.repo = takeValue();
        break;
      case "--pr":
        out.pr = takeValue();
        break;
      case "--issue":
        out.issue = takeValue();
        break;
      case "-m":
      case "--message":
        out.message = takeValue();
        break;
      case "--tag":
        out.tag = takeValue();
        break;
      case "--max-size":
        out.maxSize = takeValue();
        break;
      default:
        if (tok.startsWith("-") && tok !== "-") {
          throw new Error(`Unknown option: ${tok}`);
        }
        out.files.push(tok);
    }
  }
  return out;
}

/** Resolve the target repo from --repo, else by inferring from the git origin. */
function resolveRepo(args: ParsedArgs, gitRemote: () => string | null): Repo {
  if (args.repo !== undefined) {
    return validateRepo(args.repo);
  }
  const remote = gitRemote();
  if (remote === null) {
    throw new Error(
      "Could not determine the repository: no --repo given and no git " +
        "'origin' remote found. Pass --repo owner/repo.",
    );
  }
  return parseGitRemoteUrl(remote);
}

/** The chosen stdout format; --json and --raw are mutually exclusive (checked earlier). */
function outputFormat(args: ParsedArgs): OutputFormat {
  if (args.json) return "json";
  if (args.raw) return "raw";
  return "markdown";
}

/**
 * Parse argv and run the upload (and optional comment) flow, returning the
 * streams and exit code rather than touching them — the caller writes stdout/
 * stderr and sets the code. stdout carries only the machine-parseable result and
 * ONLY on full success (fail-fast: one upload failure aborts with empty stdout,
 * exit 1, and already-uploaded assets left for --cleanup). Every error is token-
 * sanitized before reaching stderr.
 */
export async function run(
  argv: string[],
  deps: RunDeps = {},
): Promise<CliResult> {
  const stderr: string[] = [];
  const warn = (m: string) => {
    stderr.push(m);
  };
  // Seed the redaction token from the environment BEFORE parseArgs so a parse or
  // validation error that echoes an argument (e.g. `Unknown option: --bad-<tok>`)
  // can't leak a token embedded in argv. resolveToken runs only after parsing, so
  // without this seed the catch below would redact against token="" during the
  // whole pre-resolution window (invariant 3). resolveToken overwrites this with
  // the authoritative token (possibly the gh-CLI fallback) once it runs; the gh
  // token isn't knowable here without its subprocess and isn't an argv-injection
  // vector, so the env token is the right pre-resolution redaction scope.
  let token = ((deps.env ?? process.env).GITHUB_TOKEN ?? "").trim();
  try {
    const args = parseArgs(argv);
    if (args.help) return { stdout: HELP, stderr: "", exitCode: 0 };
    if (args.version)
      return { stdout: `${version()}\n`, stderr: "", exitCode: 0 };
    if (args.cleanup) {
      // --cleanup is a destructive, standalone mode exposed as a flag on the
      // upload command. Reject any upload-only input rather than silently
      // ignoring it and starting the delete flow — a stray --cleanup on an
      // intended upload (e.g. `gh-imgup shot.png --cleanup`) must fail fast, not
      // begin deleting. Only --repo and --tag carry over to cleanup.
      const conflicts: string[] = [];
      if (args.files.length > 0) conflicts.push("file arguments");
      if (args.pr !== undefined) conflicts.push("--pr");
      if (args.issue !== undefined) conflicts.push("--issue");
      if (args.message !== undefined) conflicts.push("--message");
      if (args.json) conflicts.push("--json");
      if (args.raw) conflicts.push("--raw");
      if (args.maxSize !== undefined) conflicts.push("--max-size");
      if (conflicts.length > 0) {
        throw new Error(
          `--cleanup takes no upload inputs; remove: ${conflicts.join(", ")}.`,
        );
      }
      // Interactive, live-I/O path (not the buffered upload model): cleanup
      // writes progress and prompts straight to stderr/stdin. Its errors still
      // unwind to the decode-aware catch below.
      const cleanupWarn =
        deps.warn ??
        ((m: string) => {
          process.stderr.write(m);
        });
      const resolved = resolveToken({
        env: deps.env,
        readGhToken: deps.readGhToken,
      });
      token = resolved.token;
      if (resolved.source === "gh") cleanupWarn(BROAD_SCOPE_WARNING);
      const repo = resolveRepo(args, deps.gitRemote ?? gitRemoteOrigin);
      const tag = validateTag(args.tag ?? DEFAULT_TAG);
      await cleanup(token, repo, tag, {
        fetchImpl: deps.fetchImpl,
        warn: cleanupWarn,
        isTTY: deps.isTTY,
        confirm: deps.confirm,
      });
      return { stdout: "", stderr: stderr.join(""), exitCode: 0 };
    }
    if (args.json && args.raw) {
      throw new Error("--json and --raw are mutually exclusive.");
    }
    if (args.pr !== undefined && args.issue !== undefined) {
      throw new Error("--pr and --issue are mutually exclusive.");
    }
    if (args.files.length === 0) {
      throw new Error("No image files given. See --help for usage.");
    }

    const resolved = resolveToken({
      env: deps.env,
      readGhToken: deps.readGhToken,
    });
    token = resolved.token;
    if (resolved.source === "gh") warn(BROAD_SCOPE_WARNING);

    const repo = resolveRepo(args, deps.gitRemote ?? gitRemoteOrigin);
    const tag = validateTag(args.tag ?? DEFAULT_TAG);
    const maxBytes =
      validateMaxSize(args.maxSize ?? DEFAULT_MAX_SIZE_MB) * 1024 * 1024;
    const commentNumber =
      args.pr !== undefined
        ? validateNumber(args.pr)
        : args.issue !== undefined
          ? validateNumber(args.issue)
          : undefined;

    // --message only captions a posted comment; on an upload-only run it would be
    // silently dropped. Warn (don't fail) so the upload still succeeds — the
    // message text isn't echoed, so there's nothing to sanitize.
    if (args.message !== undefined && commentNumber === undefined) {
      warn(
        "⚠ Ignoring --message: it only captions a --pr/--issue comment, and " +
          "neither was given.\n",
      );
    }

    // Validate every file up front (fail-fast) before touching the network.
    const files: ImageFile[] = args.files.map((f) =>
      validateImageFile(f, maxBytes),
    );

    const releaseId = await ensureRelease(token, repo, tag, {
      fetchImpl: deps.fetchImpl,
      warn,
    });

    // Upload sequentially, fail-fast: the first failure aborts (its error
    // propagates) — successes already on the release are left for --cleanup.
    const results: UploadResult[] = [];
    for (const file of files) {
      const result = await uploadAsset(token, repo, releaseId, tag, file, {
        fetchImpl: deps.fetchImpl,
        warn,
      });
      results.push(result);
      warn(sanitize(token, `✓ Uploaded ${result.filename}\n`));
    }

    if (commentNumber !== undefined) {
      const caption = args.message ? `${args.message}\n\n` : "";
      const body = caption + render(results, "markdown");
      const comment = await postComment(token, repo, commentNumber, body, {
        fetchImpl: deps.fetchImpl,
        warn,
      });
      warn(
        sanitize(
          token,
          `✓ Commented on #${comment.number}${comment.url ? `: ${comment.url}` : ""}\n`,
        ),
      );
    }

    return {
      stdout: render(results, outputFormat(args)),
      stderr: stderr.join(""),
      exitCode: 0,
    };
  } catch (err) {
    // A validation/arg error can echo a user-supplied path or flag that encodes
    // the token (e.g. a file literally named ghp%5FTOK.png); sanitize() strips
    // only the literal form, so redact the whole message if it decodes to the
    // token at any depth. This catch is the one chokepoint for every such error.
    const message = sanitize(token, err);
    const safe =
      token && decodesToToken(message, token)
        ? "[error redacted: it referenced the GitHub token]"
        : message;
    stderr.push(`gh-imgup: ${safe}\n`);
    return { stdout: "", stderr: stderr.join(""), exitCode: 1 };
  }
}

/**
 * True when this module was invoked directly as the program entry point.
 * npm/npx install the `bin` via a `.bin/gh-imgup` symlink, so process.argv[1] is
 * the symlink path while import.meta.url resolves to the real dist/index.js — a
 * plain string compare returns false there and the CLI would silently no-op.
 * Resolve BOTH to their real paths (realpathSync is idempotent on a real path,
 * and also handles --preserve-symlinks) before comparing.
 */
function isEntryPoint(): boolean {
  const invoked = process.argv[1];
  if (!invoked) return false;
  try {
    return (
      realpathSync(invoked) === realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  run(process.argv.slice(2))
    .then((result) => {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      process.exit(result.exitCode);
    })
    .catch(() => {
      // run() handles its own errors; this is a last-resort guard.
      process.exit(1);
    });
}
