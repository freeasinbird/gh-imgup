import { extname } from "node:path";

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
