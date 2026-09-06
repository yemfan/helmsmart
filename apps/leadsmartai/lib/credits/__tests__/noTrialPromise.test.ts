import { readFileSync } from "node:fs";
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
 * Scoped to that path on purpose. `/api/create-checkout-session` — the legacy
 * agent ladder still reached from /pricing and PricingModal — DOES set a trial
 * (`STRIPE_AGENT_TRIAL_DAYS ?? STRIPE_TRIAL_DAYS ?? 14` whenever
 * `cancel_surface === "agent"`). Those surfaces keep their trial copy until
 * someone decides which of the two ladders the product actually sells; asserting
 * "no trial anywhere" here would make that decision by accident.
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

  it("does not quietly grow a trial in the checkout the funnel reaches", () => {
    expect(read("app/api/stripe/checkout/route.ts")).not.toContain("trial_period_days");
  });
});
