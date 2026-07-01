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
 * Max characters of a response body scanned for an encoded token. The
 * fixed-point decode in {@link decodesToToken} is O(passes × length) — worst
 * case O(n²) on a body of nested escapes — so an unbounded scan would let a
 * huge tampered body burn quadratic CPU. 16× MAX_DETAIL: only the first
 * MAX_DETAIL characters are ever echoed, and the scan window contains them
 * with enough margin that a token in any plausible encoded form (percent ~3×
 * per layer, \u 6×) reaching the echo is still detected; an encoding so deep
 * it straddles the window boundary can place only an undecodable fragment
 * inside the echoed prefix.
 */
export const MAX_SCAN = 8 * 1024;

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
 * Collapse control characters (C0, DEL, and the C1 range — which includes NEL
 * U+0085 and the single-char CSI U+009B) and the Unicode line/paragraph
 * separators to a single space before echoing a response-derived value into an
 * error message. A tampered body or reason phrase could otherwise inject
 * newlines or terminal escape sequences into stderr/CI logs (log forging).
 */
function collapseControls(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching control chars is the intent — strip them before echoing to logs.
  return text.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ");
}

/**
 * Render a response-derived value for an error message. `sanitize()` strips only
 * the literal token, so a tampered field carrying an encoded token would
 * otherwise leak it to stderr/CI logs. If the value holds the token at ANY
 * encoding depth, redact the whole field; otherwise it is echoed with control
 * characters collapsed (no log forging) for diagnostics.
 */
export function redactField(value: unknown, token: string): string {
  const str = String(value);
  return decodesToToken(str, token) ? "[REDACTED]" : collapseControls(str);
}

/**
 * Render an API response body for an error message. `sanitize()` strips only the
 * literal token, so an encoded token in a malformed/tampered body (`ghp%5FTOK`)
 * would survive; redact the whole body when it decodes to the token at any
 * depth. Otherwise collapse control characters (no log forging from a tampered
 * body) before truncating — and redact BEFORE truncating so neither a literal
 * token nor a redaction decision can be split across the cutoff.
 */
export function redactBody(token: string, body: string): string {
  const literal = sanitize(token, body);
  // Collapse before windowing: collapse is linear and only inserts spaces
  // (never joins or removes token/escape characters, which are all printable),
  // so slicing the COLLAPSED text pins the echoed prefix — a control-char run
  // can no longer pull far-away body content into the first MAX_DETAIL chars.
  // The decode-aware scan then covers the whole MAX_SCAN window, which
  // strictly contains everything echoable, so the redaction decision still
  // can't be split across the MAX_DETAIL cutoff.
  const windowed = collapseControls(literal).slice(0, MAX_SCAN);
  const safe = decodesToToken(windowed, token) ? "[REDACTED]" : windowed;
  return safe.slice(0, MAX_DETAIL);
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
