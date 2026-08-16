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

/** Proper nouns that are correct as-is in every language. */
const ALLOWED = new Set([
  "MAXY Investment Inc.",
  "CloseBoss",
  "Pinterest",
  "TikTok",
  "YouTube",
  "Pro",
  "Premium",
  "PDF",
]);

const COPY_ATTRS = /\b(?:placeholder|title|label|aria-label|alt)="([^"]+)"/g;
/**
 * The `[^=]` guard is the price of accepting one-word copy: an arrow function
 * returning a generic — `(id: string) => Promise<void>` — reads as `>Promise<`
 * to a regex, and there are a dozen of those in the calendar alone.
 */
const JSX_TEXT = /(?:^|[^=])>([^<>{}]+)</g;

/*
 * Files the widened scan newly exposed, not yet worked through. Widening the
 * predicate turned one failing assertion into 332, and holding the whole batch
 * back until every one is fixed would mean a long-lived branch and a red gate
 * in the meantime. So the backlog is explicit and enumerated instead: these
 * files may still contain English, everything else may not, and the second
 * assertion below fails the moment a file here comes clean — which is the only
 * thing that keeps the list shrinking rather than rotting.
 *
 * Delete an entry when its file is translated. When the list is empty, delete
 * the list.
 */
const PENDING = new Set([
  "app/contact/page.tsx",
  "app/dashboard/ai-sales-assistant/SalesAssistantClient.tsx",
  "app/dashboard/calls/CallsClient.tsx",
  "app/dashboard/cma/CmaListClient.tsx",
  "app/dashboard/cma/page.tsx",
  "app/dashboard/contacts/scan/ScanCardClient.tsx",
  "app/dashboard/contracts/review/ReviewContractClient.tsx",
  "app/dashboard/deep-report/DeepReportClient.tsx",
  "app/dashboard/deep-report/page.tsx",
  "app/dashboard/growth/page.tsx",
  "app/dashboard/lead-queue/LeadQueueClient.tsx",
  "app/dashboard/leads/generate/page.tsx",
  "app/dashboard/listing-offers/[id]/ListingOfferDetailClient.tsx",
  "app/dashboard/marketing/plans/MarketingPlansClient.tsx",
  "app/dashboard/offers/[id]/OfferDetailClient.tsx",
  "app/dashboard/open-house/OpenHouseQrList.tsx",
  "app/dashboard/open-houses/OpenHousesListClient.tsx",
  "app/dashboard/open-houses/flyer/FlyerBuilderClient.tsx",
  "app/dashboard/playbook-runs/[id]/OptimizePanel.tsx",
  "app/dashboard/playbook-runs/[id]/page.tsx",
  "app/dashboard/playbooks/PlaybooksPageClient.tsx",
  "app/dashboard/settings/page.tsx",
  "app/dashboard/skills/SkillsManager.tsx",
  "app/dashboard/skills/[id]/page.tsx",
  "app/dashboard/tasks/TasksClient.tsx",
  "app/dashboard/transactions/coordinator/page.tsx",
  "app/features/page.tsx",
  "app/free-tools/PromptsLeadMagnet.tsx",
  "components/AppShell.tsx",
  "components/comparison-report/ComparisonReportClient.tsx",
  "components/crm/ContactHealthPanel.tsx",
  "components/dashboard/BrandingSettingsPanel.tsx",
  "components/dashboard/DealReviewPanel.tsx",
  "components/dashboard/LeadCalendarBookingPanel.tsx",
  "components/dashboard/MissedCallActivityLog.tsx",
  "components/dashboard/OutboundCallPanel.tsx",
  "components/dashboard/RevenuePanel.tsx",
  "components/dashboard/TemplatesSummaryCard.tsx",
  "components/dashboard/TopBar.tsx",
  "components/support/SupportDashboard.tsx",
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
            const where = `${relative(ROOT, file).split(sep).join("/")}:${at(m.index ?? 0)}`;
            const rel = relative(ROOT, file).split(sep).join("/");
            (PENDING.has(rel) ? pending : findings).push(
              `${where}  ${m[1].replace(/\s+/g, " ").trim().slice(0, 80)}`,
            );
          }
        }
      }
    }
    expect(findings, `\n${findings.join("\n")}\n`).toEqual([]);
    /*
     * And the list only shrinks. Without this the allowlist rots: a file gets
     * translated, nobody removes its entry, and the next English string added
     * to it lands in a hole the guard is told to ignore.
     */
    const clean = [...PENDING].filter((f) => !pending.some((p) => p.startsWith(`${f}:`)));
    expect(clean, `\nTranslated — remove from PENDING:\n${clean.join("\n")}\n`).toEqual([]);
  });
});
