import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CREDIT_TIERS, MONTHS_PER_PERIOD, annualPriceEnv, annualUsd } from "../pricing";

/**
 * Annual has to be BUYABLE, and has to deliver what it charges for.
 *
 * The onboarding funnel offered a Monthly/Annual toggle, "Save 17%", and
 * "$3,990 billed yearly — save $798". The four annual prices existed in Stripe
 * and in Vercel. No code path could reach them: `/api/stripe/checkout` read
 * `tier.priceEnv` — the MONTHLY variable — unconditionally, and the purchase UI
 * had no cadence control at all. A prospect who chose annual to save 17% was
 * quoted $3,990 and could only ever be charged $4,788.
 *
 * The second half is the one that would have been worse. Credits are granted
 * once per PAID INVOICE, and an annual subscription raises one invoice a year.
 * Wiring annual checkout without scaling the grant would have sold a year of
 * "800 credits/mo" and delivered 800 credits — right price, missing 11/12ths of
 * the product, and no error anywhere.
 */

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("annual cadence", () => {
  it("resolves a different Stripe price than monthly, for every tier", () => {
    // The whole bug in one assertion: if these ever collapse to the same env
    // var, annual is billing the monthly price again.
    for (const tier of CREDIT_TIERS) {
      expect(annualPriceEnv(tier.id)).not.toBe(tier.priceEnv);
      expect(annualPriceEnv(tier.id)).toBe(`${tier.priceEnv}_ANNUAL`);
    }
  });

  it("charges ten months for twelve, so the advertised saving is real", () => {
    for (const tier of CREDIT_TIERS) {
      const year = annualUsd(tier.id)!;
      expect(year).toBe(tier.priceUsd * 10);
      // "Save 17%" is what the toggle promises; 2/12 = 16.7%.
      const saved = tier.priceUsd * 12 - year;
      expect(Math.round((saved / (tier.priceUsd * 12)) * 100)).toBe(17);
    }
  });

  it("delivers twelve months of credits for a year that was billed once", () => {
    expect(MONTHS_PER_PERIOD.monthly).toBe(1);
    expect(MONTHS_PER_PERIOD.annual).toBe(12);
    for (const tier of CREDIT_TIERS) {
      expect(tier.monthlyCredits * MONTHS_PER_PERIOD.annual).toBe(tier.monthlyCredits * 12);
    }
  });

  it("scales the invoice grant by cadence rather than assuming monthly", () => {
    const src = read("lib/credits/subscriptionCredits.ts");
    // The grant must be a function of the period, not a bare monthly figure.
    expect(src).toMatch(/monthlyCreditsForPlan\(plan\)\s*\*\s*months/);
    expect(src).toContain("MONTHS_PER_PERIOD");
  });

  it("refuses annual rather than silently billing monthly", () => {
    /*
     * The dangerous fix would be `annualEnv ?? tier.priceEnv`: annual appears
     * to work, the customer is charged the monthly price, and nothing fails.
     * Checkout must answer an error instead.
     */
    const src = read("app/api/stripe/checkout/route.ts");
    expect(src).toContain("annualPriceEnv");
    expect(src).toMatch(/cadence === "annual"\s*\?\s*annualPriceEnv\(tier\.id\)\s*:\s*tier\.priceEnv/);
    expect(src).toMatch(/Annual billing isn't available/);
    // And the cadence must reach the webhook, which sizes the credit grant.
    expect(src).toContain("cadence,");
  });

  it("only offers annual where a Stripe price exists to sell", () => {
    // The server decides; the client renders. If the client ever derives
    // availability from annualUsd() (which always returns a number), the
    // unbuyable-discount bug is back.
    const page = read("app/dashboard/credits/page.tsx");
    expect(page).toContain("annualPriceConfigured");
    expect(page).toContain("annualTierIds");

    const client = read("app/dashboard/credits/CreditsClient.tsx");
    expect(client).toContain("annualTierIds");
    expect(client).not.toMatch(/const\s+annualOffered\s*=\s*true/);
  });

  it("carries the chosen cadence all the way to the page that can charge", () => {
    /*
     * Reported from production: choosing Annual in the funnel and clicking
     * "Start 14-day trial" landed on /plans headed "Monthly plans" quoting
     * $399/mo. The funnel's deep link passed `from`, `plan` and `email` — and
     * /plans read none of them — so the one thing the visitor had actually
     * decided was the one thing thrown away.
     *
     * Each hop has to keep it: funnel -> /plans -> /dashboard/credits.
     */
    const funnel = read("components/onboarding/OnboardingFunnel.tsx");
    expect(funnel).toMatch(/params\.set\("cadence", cadence\)/);

    const plans = read("app/plans/page.client.tsx");
    expect(plans).toMatch(/sp\?\.get\("cadence"\)/);
    expect(plans).toMatch(/dashboard\/credits\?cadence=annual/);
    // A page showing annual prices must not still be headed "Monthly plans".
    expect(plans).toContain("plans.headingAnnual");
  });

  it("quotes no price for the retired Team tier", () => {
    // The funnel advertised "Team — $299/mo" ($249 on annual) from the old
    // ladder. There is no `team` in CREDIT_TIERS and its Stripe product is
    // archived, so any figure here is one nobody can be sold.
    expect(CREDIT_TIERS.map((t) => t.id)).not.toContain("team");
    const funnel = read("components/onboarding/OnboardingFunnel.tsx");
    expect(funnel).not.toMatch(/\$249\/mo|\$299\/mo/);
    expect(funnel).not.toContain("teamPrice");
  });

  it("buys the cadence the card quoted", () => {
    // A tier without an annual price shows a monthly figure; it must then post
    // cadence "monthly", or the customer is charged a price never shown.
    const client = read("app/dashboard/credits/CreditsClient.tsx");
    expect(client).toMatch(/cadence:\s*annualYear !== null \? "annual" : "monthly"/);
  });
});
