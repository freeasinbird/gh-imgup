#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
`;

/** Result of a CLI invocation. stdout is machine-parseable only; stderr is human-readable. */
export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
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
 * Parse argv and produce a result. Pure: no I/O side effects, no process.exit —
 * the caller writes the streams and sets the exit code. Scaffold stage handles
 * only --help and --version; upload is not yet implemented.
 */
export function run(argv: string[]): CliResult {
  if (argv.includes("-h") || argv.includes("--help")) {
    return { stdout: HELP, stderr: "", exitCode: 0 };
  }
  if (argv.includes("-v") || argv.includes("--version")) {
    return { stdout: `${version()}\n`, stderr: "", exitCode: 0 };
  }
  return {
    stdout: "",
    stderr:
      "gh-imgup: upload is not yet implemented — scaffold only. See AGENTS.md.\n",
    exitCode: 1,
  };
}

/** True when this module was invoked directly as the program entry point. */
function isEntryPoint(): boolean {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isEntryPoint()) {
  const result = run(process.argv.slice(2));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.exitCode);
}
