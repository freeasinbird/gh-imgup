/**
 * Every HTML5 named character reference whose expansion is entirely ASCII
 * (all code points <= U+007F), derived from the WHATWG entities table
 * (https://html.spec.whatwg.org/entities.json). Our matchable content (tokens,
 * asset URLs/names) is ASCII, so this finite set — plus numeric refs for any
 * char — is every named entity that can render to text we'd match; the other
 * ~2185 names expand to non-ASCII and can't. Includes the one multi-char ASCII
 * ligature (`&fjlig;` -> "fj"), the aliases (`&lsqb;`/`&lbrack;`, `&QUOT;`,
 * etc.), and the ASCII control names (`&Tab;`, `&NewLine;`). Semicolon forms
 * only: CommonMark requires the trailing `;`, so the no-semicolon legacy refs
 * never apply. To regenerate: filter entities.json to `;`-terminated names whose
 * codepoints are all <= 0x7f.
 */
const NAMED_ASCII_ENTITIES: Readonly<Record<string, string>> = {
  Tab: "\t",
  NewLine: "\n",
  excl: "!",
  quot: '"',
  QUOT: '"',
  num: "#",
  dollar: "$",
  percnt: "%",
  amp: "&",
  AMP: "&",
  apos: "'",
  lpar: "(",
  rpar: ")",
  ast: "*",
  midast: "*",
  plus: "+",
  comma: ",",
  period: ".",
  sol: "/",
  colon: ":",
  semi: ";",
  lt: "<",
  LT: "<",
  equals: "=",
  gt: ">",
  GT: ">",
  quest: "?",
  commat: "@",
  lbrack: "[",
  lsqb: "[",
  bsol: "\\",
  rbrack: "]",
  rsqb: "]",
  Hat: "^",
  lowbar: "_",
  UnderBar: "_",
  DiacriticalGrave: "`",
  grave: "`",
  fjlig: "fj",
  lbrace: "{",
  lcub: "{",
  verbar: "|",
  vert: "|",
  VerticalLine: "|",
  rbrace: "}",
  rcub: "}",
};

/**
 * Decode the HTML/Markdown character references GitHub's Markdown renderer
 * resolves, so a value is matched AS RENDERED (comment token guards and
 * --cleanup's reference scan). Numeric refs are matched at ANY length — leading
 * zeros included (`&#x000005F;`, `&#00000095;` both → `_`) — with a value guard
 * (a code point past U+10FFFF is left as text). Named refs cover every HTML5
 * entity with an ASCII expansion, including `&fjlig;` -> "fj"; since our
 * content (tokens, asset URLs/names) is ASCII, numeric + those names are every
 * entity form that can render to text we match. Over-decoding only ever
 * over-matches (a kept asset / a refused comment — both fail-safe). Percent and
 * `\u` escapes are NOT decoded — Markdown renders them literally.
 */
function decodeMarkdownEntities(s: string): string {
  return s
    .replace(/&#[xX]([0-9A-Fa-f]+);?/g, (m, h) => {
      const code = Number.parseInt(h, 16);
      return code <= 0x10ffff ? String.fromCodePoint(code) : m;
    })
    .replace(/&#(\d+);?/g, (m, d) => {
      const code = Number.parseInt(d, 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : m;
    })
    .replace(
      /&([A-Za-z][A-Za-z0-9]*);/g,
      (m, name) => NAMED_ASCII_ENTITIES[name] ?? m,
    );
}

/**
 * Remove CommonMark backslash escapes (a backslash before an ASCII punctuation
 * char renders the char literally) so public-surface checks see what GitHub
 * renders. `\_` -> _ is the only one that matters for a [A-Za-z0-9_] token (the
 * sole ASCII-punctuation token char); a backslash before a non-punctuation char
 * is left intact.
 */
function unescapeMarkdownBackslash(s: string): string {
  return s.replace(/\\([!-/:-@[-`{-~])/g, "$1");
}

/**
 * Approximate the inline text GitHub renders from a Markdown source: decode its
 * HTML/numeric character references, then drop backslash escapes. Used to check
 * a value AS RENDERED — by the comment token guard and by --cleanup when
 * deciding whether a body references an asset. Not a full renderer; it covers
 * the transforms that can hide a literal substring from a raw `includes`.
 */
export function renderInlineMarkdown(s: string): string {
  return unescapeMarkdownBackslash(decodeMarkdownEntities(s));
}

/**
 * Escape Markdown link-structural characters in alt text. The stem is a
 * user-controlled filename, so an unescaped `]` would close the `![…]` early and
 * let a crafted name inject its own image target into a PR/issue comment.
 * Backslash-escaping `\`, `[`, and `]` keeps the alt inert; C0 control
 * characters and the Unicode line/paragraph separators collapse to a single
 * space so stdout stays one machine-parseable line per image.
 */
export function escapeAltText(text: string): string {
  return (
    text
      .replace(/[\\[\]]/g, "\\$&")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: matching control chars is the intent — strip them from user-controlled alt text.
      .replace(/[\u0000-\u001f\u2028\u2029]+/g, " ")
  );
}
