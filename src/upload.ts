import { basename, extname } from "node:path";
import { escapeAltText } from "./markdown.js";

/**
 * Strict extension → MIME allowlist. Fixed map, never inferred: anything not a
 * key is rejected (no content sniffing, no application/octet-stream fallback).
 * SVG is deliberately excluded — it is the only "active content" raster-adjacent
 * format and screenshots are raster. See AGENTS.md invariant 5.
 */
export const MIME: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/**
 * Resolve a filename to its allowlisted MIME type, or undefined if unsupported.
 * The extension is lowercased before lookup so `PHOTO.PNG` resolves like
 * `photo.png` — case-folding is normalization, not the banned content inference.
 */
export function mimeFor(filename: string): string | undefined {
  return MIME[extname(filename).toLowerCase()];
}

/** One uploaded asset, the unit the output formatters render. */
export interface UploadResult {
  /** Original filename as given by the user, e.g. `screenshot.png`. */
  filename: string;
  /** Public `browser_download_url` of the uploaded asset. */
  url: string;
  /** Target repository as `owner/repo`. */
  repo: string;
  /** Integrity digest from the API (`sha256:<hex>`), or "" if the server omitted it. */
  digest: string;
}

/** Machine-parseable stdout formats. Mutually exclusive; default is markdown. */
export type OutputFormat = "markdown" | "raw" | "json";

/**
 * Alt text for an image: the original filename with its extension removed. The
 * collision-avoidance hex suffix lives in the asset URL, not in `filename`, so
 * it never appears here.
 */
function altText(filename: string): string {
  return basename(filename, extname(filename));
}

/**
 * A Markdown link destination. A bare destination is terminated by `)` or
 * whitespace, so wrap in angle brackets when the URL contains either (GitHub
 * asset URLs are percent-encoded and normally don't, so the common case stays
 * unwrapped). Angle-bracket destinations are standard CommonMark.
 */
function markdownDestination(url: string): string {
  return /[\s()]/.test(url) ? `<${url}>` : url;
}

/** A single GitHub-rendering markdown image reference. */
function markdownLine(result: UploadResult): string {
  return `![${escapeAltText(altText(result.filename))}](${markdownDestination(result.url)})`;
}

/**
 * Render upload results to the stdout payload for the chosen format, including a
 * trailing newline. `json` is ALWAYS a JSON array (one object per file, even for
 * a single file) so consumers parse one stable shape regardless of file count.
 */
export function render(results: UploadResult[], format: OutputFormat): string {
  switch (format) {
    case "raw":
      return `${results.map((r) => r.url).join("\n")}\n`;
    case "json": {
      const objects = results.map((r) => ({
        url: r.url,
        markdown: markdownLine(r),
        filename: r.filename,
        repo: r.repo,
        digest: r.digest,
      }));
      return `${JSON.stringify(objects)}\n`;
    }
    default:
      return `${results.map(markdownLine).join("\n")}\n`;
  }
}
