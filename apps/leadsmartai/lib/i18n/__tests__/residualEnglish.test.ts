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
  "app/ai-real-estate-deal-analyzer/page.tsx",
  "app/delete-account/page.tsx",
  "app/how-cap-rate-affects-property-value/page.tsx",
  "app/mortgage-calculator/page.tsx",
  "app/rental-property-analyzer/page.tsx",
  "app/closing-cost-estimator/page.tsx",
  "app/market-report/[city]/page.tsx",
  "app/property-investment-analyzer/page.tsx",
  "app/rent-vs-buy-calculator/page.tsx",
  "app/agent/dashboard/page.tsx",
  "app/oh/[slug]/OpenHouseSigninClient.tsx",
  "app/cash-flow-calculator/page.tsx",
  "app/affordability-calculator/page.tsx",
  "app/home-value/[city]/page.tsx",
  "app/cap-rate-calculator/page.tsx",
  "app/down-payment-calculator/page.tsx",
  "app/switch-from/page.tsx",
  "app/open-house-signup/page.tsx",
  "app/sell-house/[city]/page.tsx",
  "app/blog/your-crm-should-call-your-sphere-not-just-text-it/page.tsx",
  "app/homes/search/HomesSearchClient.tsx",
  "app/switch-from/[slug]/page.tsx",
  "app/ai-zillow-redfin-link-analyzer/page.tsx",
  "app/how-to-compare-rent-vs-buy/page.tsx",
  "app/sms/page.tsx",
  "app/homes/page.tsx",
  "app/login/page.tsx",
  "app/property/[slug]/page.tsx",
  "app/try-demo/page.tsx",
  "app/features/[slug]/page.tsx",
  "app/blog/page.tsx",
  "app/market-report/[city]/[keyword]/page.tsx",
  "app/newsletter/page.tsx",
  "app/newsletter/[region]/[week]/page.tsx",
  "app/oh/[slug]/kiosk/KioskClient.tsx",
  "app/home-value/[city]/[keyword]/page.tsx",
  "app/home-value-widget/page.tsx",
  "app/how-to-analyze-rental-property/page.tsx",
  "app/onboarding/page.tsx",
  "app/growth/seo/[tool]/[citySlug]/page.tsx",
  "app/hoa-fee-tracker/page.tsx",
  "app/landing/home-value/page.tsx",
  "app/landing/mortgage-calculator/page.tsx",
  "app/opengraph-image.tsx",
  "app/signup/page.tsx",
  "app/skills-library/page.tsx",
  "app/cap-rate-roi-calculator/page.tsx",
  "app/how-to-buy-investment-property/page.tsx",
  "app/how-to-calculate-cap-rate/page.tsx",
  "app/how-to-evaluate-rental-cash-flow/page.tsx",
  "app/roi-calculator/page.tsx",
  "app/sell-house/[city]/[keyword]/page.tsx",
  "app/voice-ai-test-drive/page.tsx",
  "app/agent-home-value-leads/page.tsx",
  "app/auth/complete-profile/page.tsx",
  "app/help/guides/[slug]/page.tsx",
  "app/adjustable-rate-calculator/page.tsx",
  "app/book/page.tsx",
  "app/how-to-increase-cap-rate-on-rental-property/page.tsx",
  "app/cap-rate-calculator-how-to-use-it/page.tsx",
  "app/cap-rate-vs-roi/page.tsx",
  "app/newsletter/a/[token]/page.tsx",
  "app/cap-rate-by-city-in-the-united-states/page.tsx",
  "app/dashboard/admin/lead-routing/LeadRoutingAdminClient.tsx",
  "app/dashboard/ai-marketing-assistant/MarketingAssistantClient.tsx",
  "app/dashboard/credits/CreditsClient.tsx",
  "app/how-to-analyze-a-property-using-cap-rate/page.tsx",
  "app/result/[id]/page.tsx",
  "app/what-is-cap-rate-in-real-estate-investing/page.tsx",
  "components/dashboard/PostToFacebookCard.tsx",
  "app/admin/founder/FounderDashboardClient.tsx",
  "app/admin/jobs/JobsClient.tsx",
  "app/cap-rate-vs-cash-on-cash-return/page.tsx",
  "app/client/activity/page.tsx",
  "app/dashboard/calendar/CalendarClient.tsx",
  "app/dashboard/deep-report/DeepReportClient.tsx",
  "app/dashboard/house-search/HouseSearchClient.tsx",
  "app/dashboard/listing-offers/[id]/ListingOfferDetailClient.tsx",
  "app/dashboard/listings/[id]/ListingDetailClient.tsx",
  "app/dashboard/notifications/page.tsx",
  "app/dashboard/overview/OverviewClient.tsx",
  "app/demo/calendar/page.tsx",
  "app/forgot-password/page.tsx",
  "app/newsletter/confirm/page.tsx",
  "app/report/[id]/not-found.tsx",
  "components/agent-signup/AgentSignupForm.tsx",
  "components/dashboard/AgentAiSettingsPanel.tsx",
  "components/dashboard/BulkCallPanel.tsx",
  "components/dashboard/DraftsClient.tsx",
  "components/dashboard/EquityMessageDraftModal.tsx",
  "components/dashboard/LeadSourceRoiPanel.tsx",
  "components/dashboard/PipelineForecastPanel.tsx",
  "components/dashboard/PlaybooksPanel.tsx",
  "components/dashboard/SendRecommendationsButton.tsx",
  "components/dashboard/SphereImportClient.tsx",
  "components/dashboard/VoiceReceptionistSettingsPanel.tsx",
  "components/listings/ListingAdPanel.tsx",
  "components/marketing/LeadSmartEditorialLanding.tsx",
  "components/PricingModal.tsx",
  "components/referrals/ReferAFriendCard.tsx",
  "components/sales-model/AiSmsModal.tsx",
  "components/sales-model/ModelToolsGrid.tsx",
  "components/team/TeamDashboard.tsx",
  "app/admin/growth-digests/GrowthDigestLogClient.tsx",
  "app/admin/observability/ObservabilityClient.tsx",
  "app/admin/open-house-visitors/OpenHouseVisitorLogClient.tsx",
  "app/admin/transactions-nudges/NudgeLogClient.tsx",
  "app/cap-rate-example-for-rental-property/page.tsx",
  "app/cap-rate-formula-explained-for-beginners/page.tsx",
  "app/client/explore/page.tsx",
  "app/cma/[id]/page.tsx",
  "app/dashboard/coaching/CoachingClient.tsx",
  "app/dashboard/comparison-report/ComparisonReportBuilderClient.tsx",
  "app/dashboard/contracts/review/ReviewContractClient.tsx",
  "app/dashboard/marketing/plans/MarketingPlansClient.tsx",
  "app/dashboard/playbook-runs/[id]/page.tsx",
  "app/dashboard/skills/[id]/SkillRunner.tsx",
  "app/dashboard/transactions/new/NewTransactionClient.tsx",
  "app/dashboard/transactions/[id]/TransactionDetailClient.tsx",
  "app/data/reports/[slug]/page.tsx",
  "app/demo/drafts/page.tsx",
  "app/financial-services/dashboard/_components/ComingSoon.tsx",
  "app/financial-services/page.tsx",
  "app/global-error.tsx",
  "app/homes/search/page.tsx",
  "app/how-cap-rate-changes-in-different-markets/page.tsx",
  "app/newsletter/unsubscribe/page.tsx",
  "app/offer-extend/[token]/page.tsx",
  "app/team/accept/[token]/page.tsx",
  "app/unauthorized/page.tsx",
  "components/AuthModal.tsx",
  "components/comparison-report/ComparisonReportClient.tsx",
  "components/crm/CsvImportModal.tsx",
  "components/dashboard/BriefingsCard.tsx",
  "components/dashboard/LikelyBuyersPanel.tsx",
  "components/dashboard/MissedCallSettingsForm.tsx",
  "components/dashboard/SocialAutopilotController.tsx",
  "components/dashboard/SphereMonetizationPanel.tsx",
  "components/dashboard/SphereSignalsList.tsx",
  "components/dashboard/VoiceCallTimelinePanel.tsx",
  "components/marketing/PostQueue.tsx",
  "components/marketing/WeeklySocialPosts.tsx",
  "components/sales-model/PipelineView.tsx",
  "components/sales-model/ScriptGenerator.tsx",
  "app/admin/lead-queue/AdminLeadQueueClient.tsx",
  "app/admin/seller-updates/SellerUpdateLogClient.tsx",
  "app/cap-rate-vs-internal-rate-of-return-irr/page.tsx",
  "app/client/tracker/page.tsx",
  "app/contact/ContactForm.tsx",
  "app/dashboard/admin/tool-usage/layout.tsx",
  "app/dashboard/ai-accountant/AccountantClient.tsx",
  "app/dashboard/ai-receptionist/ReceptionistClient.tsx",
  "app/dashboard/ai-sales-assistant/SalesAssistantClient.tsx",
  "app/dashboard/calls/CallsClient.tsx",
  "app/dashboard/cma/CmaListClient.tsx",
  "app/dashboard/error.tsx",
  "app/dashboard/lead-queue/LeadQueueClient.tsx",
  "app/dashboard/leads/[id]/LeadProfileClient.tsx",
  "app/dashboard/offers/[id]/OfferDetailClient.tsx",
  "app/dashboard/open-houses/flyer/FlyerBuilderClient.tsx",
  "app/dashboard/opportunities/page.tsx",
  "app/dashboard/settings/MlsCsvImportClient.tsx",
  "app/dashboard/showings/new/NewShowingClient.tsx",
  "app/dashboard/showings/[id]/ShowingDetailClient.tsx",
  "app/dashboard/skills/page.tsx",
  "app/dashboard/transactions/coordinator/CoordinatorClient.tsx",
  "app/demo/contacts/page.tsx",
  "app/demo/page.tsx",
  "app/error.tsx",
  "app/financial-services/dashboard/fna/FnaGeneratorClient.tsx",
  "app/financial-services/dashboard/recruits/RecruitPipelineClient.tsx",
  "app/loan-broker/pricing/page.client.tsx",
  "app/support/dashboard/page.tsx",
  "components/AppShell.tsx",
  "components/cma/CmaShareView.tsx",
  "components/consent/SmsConsentNotice.tsx",
  "components/crm/ReengagementPanel.tsx",
  "components/dashboard/AgentVoiceSettingsPanel.tsx",
  "components/dashboard/AiChatPanel.tsx",
  "components/dashboard/AISuggestedPropertiesPanel.tsx",
  "components/dashboard/BooksClient.tsx",
  "components/dashboard/BossOnboardingCard.tsx",
  "components/dashboard/DealCoachPanel.tsx",
  "components/dashboard/EmailEngagementPanel.tsx",
  "components/dashboard/ExpensesClient.tsx",
  "components/dashboard/LeadRoutingSettingsPanel.tsx",
  "components/dashboard/LikelySellersPanel.tsx",
  "components/dashboard/MissedCallSettingsPanel.tsx",
  "components/dashboard/RunSchedulerButton.tsx",
  "components/dashboard/SalesOutreachComposer.tsx",
  "components/dashboard/SchedulerActivityClient.tsx",
  "components/dashboard/SphereDripSettingsPanel.tsx",
  "components/dashboard/TemplatePickerClient.tsx",
  "components/marketing/ClientNewsletterCard.tsx",
  "components/onboarding/SetupWizard.tsx",
  "components/postcards/animations/index.tsx",
  "components/realtyboss/LeadProfileDrawer.tsx",
  "components/realtyboss/RunCard.tsx",
  "components/sales-model/AiEmailModal.tsx",
  "components/sales-model/SalesModelCard.tsx",
  "components/team/TeamBreakdownPanel.tsx",
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
  if (/^(?:as|satisfies) [A-Z]/.test(t)) return false;
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
