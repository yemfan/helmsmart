import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * "This page is translated" turned out to be a weaker claim than it sounds.
 * Every file below passes the `useTranslation` check, and 46 English strings
 * were still rendering from them — headings, form labels, tooltips, and a
 * module-scope JSX constant in the sidebar itself.
 *
 * The check covers JSX text nodes and copy-carrying attributes with no
 * interpolation. It has been widened twice, each time after the narrower
 * version reported a page clean that was still visibly English:
 *
 *   - one-word copy (Save, Cancel, Done) — 42 strings the two-word rule hid;
 *   - text nodes wrapped across source lines — 285 strings, and the worst of
 *     the three, because a paragraph long enough to wrap is a paragraph long
 *     enough to matter. Help text and explainers are almost all of it.
 *
 * The cost of widening is false positives, so both widenings are paid for by a
 * specific guard: capitalisation for single words, and a `[^=]` lookbehind for
 * arrow functions. A scan that cries wolf gets ignored, and then it protects
 * nothing.
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
 * The `[^=]` guard is the price of accepting one-word copy: an arrow function
 * returning a generic — `(id: string) => Promise<void>` — reads as `>Promise<`
 * to a regex, and there are a dozen of those in the calendar alone.
 */
const JSX_TEXT = /(?:^|[^=])>([^<>{}]+)</g;

/*
 * Marketing and article pages that now carry i18n chrome but whose body copy
 * is still being worked through. Same contract as before: these files may
 * contain English, everything else may not, and the second assertion fails the
 * moment one comes clean - so the list can only shrink.
 *
 * Delete an entry when its page is finished. When the list is empty, delete
 * the list and the assertion under it.
 */
const PENDING = new Set([
  "app/blog/why-real-estate-crms-keep-failing-solo-agents/page.tsx",
  "app/blog/liondesk-shutdown-what-agents-should-do-next/page.tsx",
  "app/ai-cma-analyzer/page.tsx",
  "app/home-value-funnel/page.tsx",
  "app/cap-rate-for-multifamily-investments/page.tsx",
  "app/cap-rate-vs-gross-rent-multiplier/page.tsx",
  "app/why-cap-rate-matters-for-real-estate-investors/page.tsx",
  "app/ai-real-estate-deal-analyzer/page.tsx",
  "app/cap-rate-mistakes-real-estate-investors-make/page.tsx",
  "app/how-banks-use-cap-rate-to-value-property/page.tsx",
  "app/smart-cma-builder/page.tsx",
  "app/what-is-a-good-cap-rate-for-rental-property/page.tsx",
  "app/delete-account/page.tsx",
  "app/how-cap-rate-affects-property-value/page.tsx",
  "app/rental-property-analyzer/page.tsx",
  "app/agent/dashboard/page.tsx",
  "app/oh/[slug]/OpenHouseSigninClient.tsx",
  "app/refinance-calculator/page.tsx",
  "app/closing-cost-estimator/page.tsx",
  "app/mortgage-calculator/page.tsx",
  "app/rent-vs-buy-calculator/page.tsx",
  "app/homes/search/HomesSearchClient.tsx",
  "app/blog/your-crm-should-call-your-sphere-not-just-text-it/page.tsx",
  "app/cap-rate-calculator/page.tsx",
  "app/cash-flow-calculator/page.tsx",
  "app/open-house-signup/page.tsx",
  "app/affordability-calculator/page.tsx",
  "app/ai-zillow-redfin-link-analyzer/page.tsx",
  "app/down-payment-calculator/page.tsx",
  "app/homes/page.tsx",
  "app/market-report/[city]/page.tsx",
  "app/property/[slug]/page.tsx",
  "app/property-investment-analyzer/page.tsx",
  "app/try-demo/page.tsx",
  "app/switch-from/page.tsx",
  "app/switch-from/[slug]/page.tsx",
  "app/blog/page.tsx",
  "app/login/page.tsx",
  "app/sms/page.tsx",
  "app/how-to-compare-rent-vs-buy/page.tsx",
  "app/newsletter/page.tsx",
  "app/features/[slug]/page.tsx",
  "app/hoa-fee-tracker/page.tsx",
  "app/home-value/[city]/page.tsx",
  "app/home-value-widget/page.tsx",
  "app/landing/home-value/page.tsx",
  "app/landing/mortgage-calculator/page.tsx",
  "app/oh/[slug]/kiosk/KioskClient.tsx",
  "app/onboarding/page.tsx",
  "app/opengraph-image.tsx",
  "app/sell-house/[city]/page.tsx",
  "app/cap-rate-roi-calculator/page.tsx",
  "app/how-to-buy-investment-property/page.tsx",
  "app/market-report/[city]/[keyword]/page.tsx",
  "app/roi-calculator/page.tsx",
  "app/skills-library/page.tsx",
  "app/voice-ai-test-drive/page.tsx",
  "app/agent-home-value-leads/page.tsx",
  "app/home-value/[city]/[keyword]/page.tsx",
  "app/signup/page.tsx",
  "app/adjustable-rate-calculator/page.tsx",
  "app/book/page.tsx",
  "app/help/guides/[slug]/page.tsx",
  "app/how-to-calculate-cap-rate/page.tsx",
  "app/auth/complete-profile/page.tsx",
  "app/how-to-evaluate-rental-cash-flow/page.tsx",
  "app/sell-house/[city]/[keyword]/page.tsx",
  "app/how-to-analyze-rental-property/page.tsx",
  "app/newsletter/[region]/[week]/page.tsx",
  "app/forgot-password/page.tsx",
  "app/growth/seo/[tool]/[citySlug]/page.tsx",
  "app/newsletter/confirm/page.tsx",
  "app/report/[id]/not-found.tsx",
  "app/result/[id]/page.tsx",
  "app/cma/[id]/page.tsx",
  "app/homes/search/page.tsx",
  "app/newsletter/unsubscribe/page.tsx",
  "app/offer-extend/[token]/page.tsx",
  "app/team/accept/[token]/page.tsx",
  "app/unauthorized/page.tsx",
  "app/global-error.tsx",
  "app/newsletter/a/[token]/page.tsx",
]);

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
  s.replace(/<code\b[^>]*>[\s\S]*?<\/code>/g, (m) => m.replace(/[^\n]/g, " "));

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
  if (/[{}<>$`]/.test(t)) return false; // interpolated or markup — not a literal
  if (!/^[A-Za-z][A-Za-z0-9 ,.'’!?:;%()/&+—–-]*$/.test(t)) return false;
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
    const pending: string[] = [];
    for (const root of SCAN) {
      for (const file of walk(join(ROOT, root))) {
        const src = readFileSync(file, "utf8");
        if (!/useTranslation|getServerT/.test(src)) continue;
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
            const where = `${rel}:${at(m.index ?? 0)}`;
            (PENDING.has(rel) ? pending : findings).push(
              `${where}  ${m[1].replace(/\s+/g, " ").trim().slice(0, 80)}`,
            );
          }
        }
      }
    }
    expect(findings, `\n${findings.join("\n")}\n`).toEqual([]);
    // The list only shrinks: a file that comes clean must leave it.
    const clean = [...PENDING].filter((f) => !pending.some((x) => x.startsWith(`${f}:`)));
    expect(clean, `\nTranslated — remove from PENDING:\n${clean.join("\n")}\n`).toEqual([]);
  });
});
