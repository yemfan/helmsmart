import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * "This page is translated" turned out to be a weaker claim than it sounds.
 * Every file below passes the `useTranslation` check, and 46 English strings
 * were still rendering from them — headings, form labels, tooltips, and a
 * module-scope JSX constant in the sidebar itself.
 *
 * The check covers JSX text nodes and copy-carrying attributes. It has been
 * widened three times, each time after the narrower version reported a page
 * clean that was still visibly English:
 *
 *   - one-word copy (Save, Cancel, Done) — 42 strings the two-word rule hid;
 *   - text nodes wrapped across source lines — 285 strings, because a
 *     paragraph long enough to wrap is a paragraph long enough to matter.
 *     Help text and explainers are almost all of it;
 *   - text nodes adjacent to an interpolation — 390 strings, and the worst of
 *     the three. A sentence with a `{value}` in the middle is two text nodes,
 *     and only the half between two tags was ever checked, so the pages that
 *     failed were the ones that say something specific to the reader.
 *
 * The cost of widening is false positives, so each widening is paid for by a
 * specific guard: capitalisation for single words, a `[^=]` lookbehind for
 * arrow functions, and — once a `}` can open a match — rejection of cast
 * tails, resumed statements, and calls. A scan that cries wolf gets ignored,
 * and then it protects nothing.
 */

const ROOT = join(__dirname, "..", "..", "..");
const SCAN = ["app", "components"];

/**
 * Proper nouns that are correct as-is in every language — plus the company's
 * postal address, which has to stay in the form the US post office reads no
 * matter who is looking at the page.
 */
const ALLOWED = new Set([
  "MAXY Investment Inc.",
  "Sugar Land, TX 77479",
  "United States",
  "CloseBoss",
  "CloseBoss AI",
  // Competitor product names, in a comparison table that names them.
  "AgencyBloc / Redtail CRM",
  "Salesforce Financial Services Cloud",
  "Pinterest",
  "TikTok",
  "YouTube",
  "Pro",
  "Premium",
  "Elite",
  "Signature",
  "Team",
  "PDF",
  // The key cap, not a word: it is printed on the keyboard the same way here.
  "Esc",
  // Max is an AI employee on the team, not the adjective.
  "Max",
]);

const COPY_ATTRS = /\b(?:placeholder|title|label|aria-label|alt)="([^"]+)"/g;
/**
 * A JSX text node is bounded by a tag *or* an interpolation on either side —
 * four combinations, of which `>text<` is one. Matching only that one hid
 * every clause sitting next to a `{value}`: the lead in
 * `The five things {partner} producers have today` and the tail in
 * `<strong>Lead-in,</strong>{" "} the rest of the sentence.`
 *
 * 390 strings across 154 files this scan had already reported clean. Those
 * pages render a Chinese fragment welded to an English one, which reads worse
 * than either language alone would.
 *
 * Lookahead on the closing delimiter so two adjacent segments don't consume
 * each other's boundary. The `[^=]` guard is the price of accepting one-word
 * copy: an arrow function returning a generic — `(id: string) => Promise<void>`
 * — reads as `>Promise<` to a regex, and the calendar alone has a dozen.
 */
const JSX_TEXT = /(?:^|[^=])[>}]([^<>{}]+)(?=[<{])/g;

/**
 * Files that stay English on purpose, with the reason.
 *
 * Distinct from PENDING: nothing here is waiting to be translated, so these
 * are exempt permanently rather than tracked down to zero. Adding one is a
 * decision, not a deferral — say why, or translate the file instead.
 */
const EXEMPT = new Map<string, string>([
  [
    "app/opengraph-image.tsx",
    // next/og renders with a Latin-only default font. Chinese here would come
    // out as tofu boxes in every social preview, which is worse than English.
    "OG image: next/og default font has no CJK glyphs",
  ],
  [
    "app/dashboard/ai-sales-assistant/SalesAssistantClient.tsx",
    /*
     * The English here is a system prompt sent to the voice model, not copy on
     * a screen. Translating it because the AGENT'S dashboard is in Chinese
     * would make the assistant greet English-speaking CALLERS in Chinese —
     * the language of a call belongs to whoever picks up, not to the UI.
     */
    "Voice system prompt: model input, and the caller chooses the language",
  ],
]);

/*
 * There used to be a PENDING list here — pages carrying i18n chrome whose body
 * copy was still being worked through. It peaked at 236 files and is now
 * empty, so it is gone along with the assertion that kept it shrinking. The
 * contract is simply that no internationalised file contains English.
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== "__tests__") walk(p, out);
    } else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/**
 * Blank comments rather than delete them: deleting shifts every line number
 * after the first comment, so the reported location doesn't match the file.
 */
const blankComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/^(\s*)\/\/.*$/gm, "$1");

/**
 * A <code> block is a sample the reader retypes, not copy — the setup steps on
 * the calendar page show a literal Gmail filter, and translating it would give
 * a Chinese-speaking agent a search that matches nothing.
 */
const blankCode = (s: string) =>
  s
    .replace(/<code\b[^>]*>[\s\S]*?<\/code>/g, (m) => m.replace(/[^\n]/g, " "))
    // CSS in a <style> block is selectors, not sentences: `html, body {`.
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, (m) => m.replace(/[^\n]/g, " "));

function isCopy(raw: string): boolean {
  // A wrapped paragraph carries its indentation with it; compare on one line.
  const t = raw.replace(/\s+/g, " ").trim();
  if (ALLOWED.has(t)) return false;
  /*
   * A blank line inside the match means the `>` and the `<` belong to
   * different statements, not to one text node: `endX > W - 90;` followed by
   * a blank line and `return (` reads as copy once the whitespace collapses.
   * Wrapped copy carries single newlines, never an empty line.
   */
  if (/\n\s*\n/.test(raw)) return false;
  /*
   * Three shapes of code that read as copy once a `}` can open the match:
   * a cast tail (`} as Record<`), a statement resuming after a block, and a
   * call whose arguments span lines. Each was a real false positive, not a
   * hypothetical — the alternative is a scan that cries wolf and gets ignored.
   */
  if (/^(?:as|satisfies) (?:const\b|[A-Z])/.test(t)) return false;
  /*
   * Declaration keywords, all lowercase and none of which open English copy
   * the way `for` and `if` do — `new`, `case`, `class` and `type` are left out
   * deliberately, because "new listings", "case study" and "Class A
   * properties" are all real copy in this app.
   */
  if (/^(?:export|import|static|default|throw|break|continue|enum|interface)\b/.test(t)) return false;
  // `for` and `if` open English sentences too ("for best fit"), so the
  // statement rejection demands the paren that a keyword would carry.
  if (/^(?:if|for|while|switch|catch)\s*\(/.test(t)) return false;
  if (/^(?:return|const|let|var|function|else|try|await|typeof)\b/.test(t)) return false;
  if (/^[a-z][A-Za-z0-9]*\(/.test(t)) return false;
  /*
   * A statement boundary: `> horizon) continue; alerts.push(`. Prose uses
   * semicolons too, but a prose semicolon is followed by a word — never by an
   * identifier that immediately calls or dereferences something.
   */
  if (/;\s*[a-z_$][\w$]*[.(]/.test(t)) return false;
  if (/[{}<>$`]/.test(t)) return false; // interpolated or markup — not a literal
  if (!/^[A-Za-z][A-Za-z0-9 ,.'’!?:;%()/&+…→—–-]*$/.test(t)) return false;
  const words = t.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length;
  /*
   * One-word copy counts too. Requiring two words hid every Save, Cancel,
   * Done, Notes and Paid in the app — 42 of them, on pages that were otherwise
   * fully translated. A single word only counts when it is capitalised, which
   * is what separates a button label from an identifier in `=> value <`.
   */
  if (words === 1) return t.length >= 3 && /^[A-Z]/.test(t);
  return words >= 2 && t.length >= 6;
}

describe("residual English", () => {
  it("does not linger in files that are already internationalised", () => {
    const findings: string[] = [];
    for (const root of SCAN) {
      for (const file of walk(join(ROOT, root))) {
        const src = readFileSync(file, "utf8");
        if (!/useTranslation|getServerT/.test(src)) continue;
        if (EXEMPT.has(relative(ROOT, file).split(sep).join("/"))) continue;
        /*
         * Scan the whole file, not line by line: a text node that wraps has no
         * `>text<` on any single line, so a per-line scan reports it clean.
         * Line numbers come from counting newlines up to the match offset.
         */
        const body = blankCode(blankComments(src));
        const at = (offset: number) => body.slice(0, offset).split("\n").length;
        for (const re of [JSX_TEXT, COPY_ATTRS]) {
          for (const m of body.matchAll(re)) {
            if (!isCopy(m[1])) continue;
            const rel = relative(ROOT, file).split(sep).join("/");
            findings.push(
              `${rel}:${at(m.index ?? 0)}  ${m[1].replace(/\s+/g, " ").trim().slice(0, 80)}`,
            );
          }
        }
      }
    }
    expect(findings, `\n${findings.join("\n")}\n`).toEqual([]);
  });
});
