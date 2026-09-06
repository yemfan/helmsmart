/**
 * Parsing one line of AI-authored markdown into text / bold / link pieces.
 *
 * Pure and in `lib/` so it is testable: vitest only collects `lib/**‍/*.test.ts`
 * here, and this is the part with the decisions in it. MarkdownLite is the
 * thin component that turns these pieces into elements.
 */

export type InlinePiece =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "link"; text: string; href: string };

/**
 * Which hrefs may become a clickable anchor.
 *
 * The text is written by a model, so the href is untrusted input heading for
 * the DOM. Two separate problems:
 *
 *  - `javascript:` and `data:` URLs must never become an anchor.
 *  - An absolute URL may be a HALLUCINATED HOST. Max linked
 *    "https://closeboss.com/dashboard/settings/account" to a realtor: it
 *    invented the domain from the brand name, and that domain resolves to
 *    somebody else's servers. Rendering that as a tidy blue link is worse than
 *    showing the raw markdown — it launders a wrong destination into a
 *    trustworthy-looking one.
 *
 * So in-app paths (a single leading "/") link, and everything else stays the
 * literal text it was written as: visible, inert, and obviously odd. Absolute
 * links to real deliverables reach the UI through `artifactUrl`, which the app
 * builds, not through prose the model composed.
 */
export function safeHref(href: string): string | null {
  const h = href.trim();
  return h.startsWith("/") && !h.startsWith("//") ? h : null;
}

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const BOLD = /\*\*(.+?)\*\*/g;

function boldPieces(text: string): InlinePiece[] {
  const out: InlinePiece[] = [];
  let last = 0;
  for (const m of text.matchAll(BOLD)) {
    if (m.index! > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    out.push({ kind: "bold", text: m[1] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** Split a line into pieces. Links are matched first so bold works around them. */
export function parseInline(line: string): InlinePiece[] {
  const out: InlinePiece[] = [];
  let last = 0;
  for (const m of line.matchAll(LINK)) {
    if (m.index! > last) out.push(...boldPieces(line.slice(last, m.index)));
    const href = safeHref(m[2]);
    // A rejected href keeps its ORIGINAL markdown, so nothing is silently
    // dropped and a wrong link stays legible as a wrong link.
    if (href) out.push({ kind: "link", text: m[1], href });
    else out.push({ kind: "text", text: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < line.length) out.push(...boldPieces(line.slice(last)));
  return out;
}
