import { sanitize } from "./auth.js";

/**
 * Shared, security-critical helpers for turning a GitHub API response into a
 * safe, token-free message. Used by every module that talks to the API
 * (release, github, cleanup) so the leak defenses live in exactly one place and
 * can't drift between consumers. `sanitize` (auth.ts) strips the LITERAL token;
 * the helpers here additionally defeat ENCODED forms a tampered/proxied response
 * could carry, and bound error detail.
 */

/** Max characters of an API error body echoed into a message (keeps errors readable). */
export const MAX_DETAIL = 500;

/**
 * Whether `value` contains `token` at any escaping depth. `sanitize()` only
 * strips the literal token, so a value can smuggle it past as a percent escape
 * (`ghp%5FTOK`, in URLs) or a JS/JSON unicode escape (`ghp_TOK`, in JSON
 * error bodies). Decodes both forms piecewise to a fixed point — tolerant of
 * malformed escapes (`decodeURIComponent` is all-or-nothing, so one bad `%zz`
 * must not disable the check) — then looks for the token. Covers literal,
 * singly-, multiply-, and mixed-form encodings.
 */
export function decodesToToken(value: string, token: string): boolean {
  let current = value;
  // Decode to a fixed point with no arbitrary depth cap. Each changing pass
  // peels one layer: a %XX (3 chars) or a \uXXXX (6 chars) → 1 char, so the
  // string strictly shortens and the fixed point is reached in at most
  // value.length passes. The bound only guarantees termination should
  // `next === current` ever fail to fire; a token escaped to ANY depth or form
  // is still caught.
  for (let i = 0; i <= value.length; i += 1) {
    if (current.includes(token)) return true;
    const next = current
      .replace(/%[0-9A-Fa-f]{2}/g, (m) => {
        try {
          return decodeURIComponent(m);
        } catch {
          return m;
        }
      })
      .replace(/\\u([0-9A-Fa-f]{4})/g, (_m, hex) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      );
    if (next === current) break;
    current = next;
  }
  return current.includes(token);
}

/**
 * Render a response-derived value for an error message. `sanitize()` strips only
 * the literal token, so a tampered field carrying an encoded token would
 * otherwise leak it to stderr/CI logs. If the value holds the token at ANY
 * encoding depth, redact the whole field; otherwise it is safe to echo verbatim
 * for diagnostics.
 */
export function redactField(value: unknown, token: string): string {
  const str = String(value);
  return decodesToToken(str, token) ? "[REDACTED]" : str;
}

/**
 * Render an API response body for an error message. `sanitize()` strips only the
 * literal token, so an encoded token in a malformed/tampered body (`ghp%5FTOK`)
 * would survive; redact the whole body when it decodes to the token at any
 * depth. Redact BEFORE truncating so neither a literal token nor a redaction
 * decision can be split across the cutoff.
 */
export function redactBody(token: string, body: string): string {
  const literal = sanitize(token, body);
  return (decodesToToken(literal, token) ? "[REDACTED]" : literal).slice(
    0,
    MAX_DETAIL,
  );
}

/**
 * Build a sanitized Error from a non-ok API response (token stripped — literal
 * and encoded — body truncated). `scope` names the permission the operation
 * needs, surfaced on 401/403 since the API doesn't make the missing scope
 * derivable from the response.
 */
export async function apiError(
  token: string,
  res: Response,
  context: string,
  scope = "contents:write",
): Promise<Error> {
  let detail = "";
  try {
    detail = redactBody(token, await res.text());
  } catch {
    // body already consumed or unreadable — status line is enough
  }
  const hint =
    res.status === 401 || res.status === 403
      ? ` (the token may be invalid or lack ${scope})`
      : "";
  // statusText is response-controlled too (a proxy can set the reason phrase),
  // so it gets the same decode-aware redaction as the body — the last echoed
  // response value in this message that literal sanitize() alone would miss.
  const status = redactField(res.statusText, token);
  const message = `${context} failed: ${res.status} ${status}${hint}${
    detail ? ` — ${detail}` : ""
  }`;
  return new Error(sanitize(token, new Error(message)));
}
