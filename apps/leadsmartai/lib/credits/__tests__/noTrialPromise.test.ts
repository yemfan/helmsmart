import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { FREE_TIER, TRIAL_DAYS } from "../pricing";

/**
 * The onboarding funnel promises no trial, because on ITS path there isn't one.
 *
 * Every paid card said "Start 14-day trial", with "14-day free trial" beneath
 * it and the same claim in the step header. The funnel lands on
 * /dashboard/credits, which buys through `/api/stripe/checkout` — that route
 * sets no `trial_period_days` and the credit-ladder prices carry none, so
 * clicking it charged the card immediately: a promise that arrives as a refund
 * request rather than a bug report.
 *
 * That decision is now settled for the whole product. The legacy agent route
 * `/api/create-checkout-session` used to open a trial of
 * `STRIPE_AGENT_TRIAL_DAYS ?? STRIPE_TRIAL_DAYS ?? 14` days whenever
 * `cancel_surface === "agent"`. Note what that default meant: an unset env
 * var granted a fortnight of free product, so the switch failed in the
 * generous direction. The route is deleted now, along with the two surfaces
 * that called it — they sold a ladder this product no longer has.
 *
 * And it must not be fixed by adding a trial. `pricing.ts` settled that
 * deliberately: FREE_TIER is permanent, because a CRM proves itself over about
 * ninety days rather than fourteen, and a free tier is the one thing on this
 * price list competitors don't have. Wiring a Stripe trial would also start
 * giving credits away — a trial invoice is $0, Stripe marks it paid, and the
 * grant fires per paid invoice.
 *
 * So: the free plan IS the trial, and paid plans are an upgrade.
 */

const APP = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

describe("the onboarding funnel promises no trial", () => {
  it("keeps the free tier permanent rather than time-boxed", () => {
    expect(TRIAL_DAYS).toBe(0);
    expect(FREE_TIER.monthlyCredits).toBeGreaterThan(0);
  });

  it("leaves no 14-day claim in the funnel", () => {
    expect(read("components/onboarding/OnboardingFunnel.tsx")).not.toMatch(
      /14[- ]day|14 天/,
    );
  });

  it("uses one vocabulary: the free plan is the trial, paid plans are an upgrade", () => {
    const funnel = read("components/onboarding/OnboardingFunnel.tsx");
    expect(funnel).toContain("pages.onboardingFunnel.startFreeTrial");
    expect(funnel).toContain("pages.onboardingFunnel.upgrade");
    // The retired wording must not creep back in beside the new keys.
    expect(funnel).not.toContain("pages.onboardingFunnel.ctaTrial");
    expect(funnel).not.toContain("pages.onboardingFunnel.trialFooter");
  });

  it("says it in both languages, and says something different in each", () => {
    const locales = join(APP, "..", "..", "packages", "i18n", "locales");
    const load = (loc: string) =>
      JSON.parse(readFileSync(join(locales, loc, "dashboard.json"), "utf8")).pages
        .onboardingFunnel as Record<string, string>;
    const en = load("en");
    const zh = load("zh-Hans");
    for (const key of ["startFreeTrial", "freeTrialNote", "upgrade", "trialNote"]) {
      expect(en[key], `en.${key}`).toBeTruthy();
      expect(zh[key], `zh.${key}`).toBeTruthy();
      expect(zh[key], `zh.${key} is still English`).not.toBe(en[key]);
    }
    // The header used to advertise the fortnight in both languages.
    expect(en.trialNote).not.toMatch(/14/);
    expect(zh.trialNote).not.toMatch(/14/);
  });

  it("grants no trial from EITHER checkout route", () => {
    // Two live ladders sold two different offers depending on which page the
    // customer came in through. Both charge on selection now.
    expect(read("app/api/stripe/checkout/route.ts")).not.toContain("trial_period_days");
    /*
     * The legacy agent-ladder route is gone entirely — it sold the retired
     * Pro $79 / Premium $199 tiers, and the only surfaces that called it are
     * retired too. Absence is the strongest version of this assertion.
     */
    expect(existsSync(join(APP, "app/api/create-checkout-session/route.ts"))).toBe(false);
  });

  it("leaves no 14-day promise on ANY marketing surface", () => {
    /*
     * Fifteen keys across the funnel, the editorial landing page, the demo
     * shell, the switch-from pages, the blog index and the CRM-problems page
     * each promised a fortnight. The competitor comparison was the sharpest:
     * it named Lofty, said they offer no trial, and claimed one for us.
     *
     * Unrelated "14 days" (deadlines, activity windows, an invite that
     * expires) are legitimate, so this looks for the PROMISE, not the number.
     */
    const locales = join(APP, "..", "..", "packages", "i18n", "locales");
    for (const loc of ["en", "zh-Hans"]) {
      const raw = readFileSync(join(locales, loc, "dashboard.json"), "utf8");
      expect(raw, `${loc} still promises a trial`).not.toMatch(
        /14[- ]day free trial|14 天免费试用|14[- ]day trial|14 天试用/,
      );
    }
  });

  it("says the same thing in the Terms as on the pricing pages", () => {
    const terms = read("app/terms/page.tsx");
    expect(terms).not.toMatch(/up to 14 days/);
    expect(terms).toMatch(/do not include a trial period/);
  });
});
