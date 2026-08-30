import { describe, expect, it } from "vitest";
import { CREDIT_PACKS, CREDIT_TIERS } from "./pricing";

/**
 * Pricing is a promise, and these two ladders have to stay in a specific
 * relationship to each other. Both invariants below have already been broken
 * once by hand-editing numbers, so they are asserted rather than commented.
 */
describe("credit pricing ladders", () => {
  const perCredit = (priceUsd: number, credits: number) => priceUsd / credits;

  it("prices every top-up pack above any plan granting as many credits", () => {
    // If a pack undercuts an equivalent subscription, the rational move is to
    // cancel and buy packs — recurring revenue quietly converts to one-offs.
    //
    // Compares against every tier granting AT LEAST as many credits, rather
    // than one granting exactly as many. The 2026-08-30 ladder has no tier at
    // 500 credits (Solo is 800), so exact matching left pack_500 unanchored and
    // silently unchecked; and two tiers now grant 4,000, so "the" matching tier
    // was ambiguous anyway.
    for (const pack of CREDIT_PACKS) {
      const packRate = perCredit(pack.priceUsd, pack.credits);
      // Capacity tiers only. A services tier's per-credit figure is not a
      // credit price — Signature's $0.100 is $299 of capacity plus $100 of
      // specialist, divided by credits. A pack "undercutting" that says
      // nothing, because nobody cancels Signature to buy credits: they would
      // be giving up the onboarding and the named contact, not a rate.
      const atLeast = CREDIT_TIERS.filter(
        (t) => t.setupFeeUsd === null && t.monthlyCredits >= pack.credits,
      );
      for (const tier of atLeast) {
        expect(
          packRate,
          `pack ${pack.id} undercuts the ${tier.id} plan per credit`,
        ).toBeGreaterThan(perCredit(tier.priceUsd, tier.monthlyCredits));
      }
    }
  });

  it("keeps every pack above the cheapest plan rate in the ladder", () => {
    // The weaker global bar: no pack may beat the best per-credit deal on offer.
    const bestPlanRate = Math.min(
      ...CREDIT_TIERS.map((t) => perCredit(t.priceUsd, t.monthlyCredits)),
    );
    for (const pack of CREDIT_PACKS) {
      expect(perCredit(pack.priceUsd, pack.credits)).toBeGreaterThan(bestPlanRate);
    }
  });

  it("makes each bigger CAPACITY plan cheaper per credit than the one below", () => {
    // Volume has to buy a discount, or there is no reason to move up a tier.
    //
    // Applies to the capacity ladder only. Signature carries the SAME 4,000
    // credits as Premium and costs $100 more, so its per-credit rate is higher
    // by design — the extra buys a specialist, not capacity, and pretending
    // otherwise would mean inventing an allowance to justify the gap. Asserted
    // separately below so the exception stays deliberate rather than becoming a
    // hole anything could slip through.
    const capacity = CREDIT_TIERS.filter((t) => t.setupFeeUsd === null);
    const rates = capacity.map((t) => perCredit(t.priceUsd, t.monthlyCredits));
    expect(rates.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < rates.length; i += 1) {
      expect(rates[i]).toBeLessThan(rates[i - 1]);
    }
  });

  it("charges Signature more per credit, because it buys people not capacity", () => {
    const premium = CREDIT_TIERS.find((t) => t.id === "premium");
    const signature = CREDIT_TIERS.find((t) => t.id === "signature");
    expect(premium && signature).toBeTruthy();
    expect(signature!.monthlyCredits).toBe(premium!.monthlyCredits);
    expect(perCredit(signature!.priceUsd, signature!.monthlyCredits)).toBeGreaterThan(
      perCredit(premium!.priceUsd, premium!.monthlyCredits),
    );
    // And the setup fee is what makes that tier break even before month four.
    expect(signature!.setupFeeUsd).toBeGreaterThan(0);
  });

  it("gives every tier and pack a distinct Stripe price env var", () => {
    // A copy-paste that reuses an env var bills the wrong amount silently.
    const envs = [
      ...CREDIT_TIERS.map((t) => t.priceEnv),
      ...CREDIT_PACKS.map((p) => p.priceEnv),
    ];
    expect(new Set(envs).size).toBe(envs.length);
  });
});
