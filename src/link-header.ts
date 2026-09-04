/** Thrown when a `Link` header is present but can't be parsed; the caller in
 * the cleanup pagination scan turns this into a fail-closed abort (never a
 * silent "no next page", which would skip a page and risk deleting an asset
 * referenced there). */
const LINK_PARSE_ERROR = "unparseable Link header";

/**
 * Parse an RFC 8288 `Link` header into its link-values — each a `<uri-reference>`
 * followed by `;`-separated parameters. A character scan rather than splitting on
 * `,`/`;` so a comma or semicolon inside the `<…>` target or a quoted parameter
 * value isn't mistaken for a delimiter, and so the `rel` parameter is found
 * wherever it sits among the params. GitHub can place other parameters (e.g.
 * `type="…"`) before `rel`, and a regex demanding `rel="next"` immediately after
 * the target would miss the next page and silently end the scan one page early —
 * the delete-a-live-asset direction. Throws {@link LINK_PARSE_ERROR} on a
 * structurally malformed header (no parseable link-value, an unterminated `<` or
 * quote, a stray delimiter) so the caller fails closed rather than treating
 * garbage as "no next page". `rel` tokens are lowercased (relation types are
 * case-insensitive); other params are ignored.
 */
export function parseLinkHeader(
  header: string,
): Array<{ uri: string; rel: string[] }> {
  const links: Array<{ uri: string; rel: string[] }> = [];
  const n = header.length;
  let i = 0;
  const isOws = (c: string) => c === " " || c === "\t";
  const skipOws = () => {
    while (i < n && isOws(header[i] as string)) i += 1;
  };
  while (i < n) {
    skipOws();
    if (i >= n) break;
    if (header[i] !== "<") throw new Error(LINK_PARSE_ERROR);
    const end = header.indexOf(">", i + 1);
    if (end === -1) throw new Error(LINK_PARSE_ERROR);
    const uri = header.slice(i + 1, end);
    i = end + 1;
    let rel: string[] = [];
    let relSeen = false;
    skipOws();
    while (i < n && header[i] === ";") {
      i += 1;
      skipOws();
      const nameStart = i;
      while (
        i < n &&
        header[i] !== "=" &&
        header[i] !== ";" &&
        header[i] !== ","
      ) {
        i += 1;
      }
      const name = header.slice(nameStart, i).trim().toLowerCase();
      let value = "";
      if (i < n && header[i] === "=") {
        i += 1;
        skipOws();
        if (i < n && header[i] === '"') {
          i += 1;
          let v = "";
          while (i < n && header[i] !== '"') {
            if (header[i] === "\\" && i + 1 < n) i += 1;
            v += header[i];
            i += 1;
          }
          if (i >= n) throw new Error(LINK_PARSE_ERROR); // unterminated quote
          i += 1;
          value = v;
        } else {
          const vStart = i;
          while (i < n && header[i] !== ";" && header[i] !== ",") i += 1;
          value = header.slice(vStart, i).trim();
        }
      }
      if (name === "rel") {
        // RFC 8288 says a repeated `rel` keeps the FIRST occurrence. Rather than
        // silently pick one, fail closed on a duplicate: on this destructive path
        // an anomalous header must abort the scan (keep), never be reinterpreted
        // into "no next page" (e.g. `rel="next"; rel="last"` skipping a page).
        if (relSeen) throw new Error(LINK_PARSE_ERROR);
        relSeen = true;
        rel = value
          .toLowerCase()
          .split(/\s+/)
          .filter((s) => s !== "");
        // A `rel` carrying no relation token (`; rel`, `; rel=`, `; rel=""`) is
        // malformed — `rel` is required to be non-empty. Fail closed for the same
        // reason: an empty `rel` would otherwise read as "no next page" and could
        // end the scan a page early on the destructive path.
        if (rel.length === 0) throw new Error(LINK_PARSE_ERROR);
      }
      skipOws();
    }
    links.push({ uri, rel });
    skipOws();
    if (i < n) {
      if (header[i] !== ",") throw new Error(LINK_PARSE_ERROR);
      i += 1;
    }
  }
  return links;
}

/**
 * The `rel="next"` URL from a GitHub `Link` pagination header, or null when the
 * header is absent / empty or carries no `next` relation (the legitimate last
 * page). Throws (via {@link parseLinkHeader}) on a malformed header so the scan
 * fails closed instead of treating an unreadable header as the end of pagination.
 */
export function rawNextLink(header: string | null): string | null {
  if (!header || header.trim() === "") return null;
  for (const link of parseLinkHeader(header)) {
    if (link.rel.includes("next")) return link.uri;
  }
  return null;
}
