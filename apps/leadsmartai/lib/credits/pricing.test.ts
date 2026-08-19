import { describe, expect, it } from "vitest";
import { CREDIT_PACKS, CREDIT_TIERS } from "./pricing";

/**
 * Pricing is a promise, and these two ladders have to stay in a specific
 * relationship to each other. Both invariants below have already been broken
 * once by hand-editing numbers, so they are asserted rather than commented.
 */
describe("credit pricing ladders", () => {
  const perCredit = (priceUsd: number, credits: number) => priceUsd / credits;

  it("prices every top-up pack above the plan that grants the same credits", () => {
    // If a pack undercuts the equivalent subscription, the rational move is to
    // cancel and buy packs — recurring revenue quietly converts to one-offs.
    for (const pack of CREDIT_PACKS) {
      const tier = CREDIT_TIERS.find((t) => t.monthlyCredits === pack.credits);
      expect(tier, `no tier grants ${pack.credits} credits — pack ${pack.id} is unanchored`)
        .toBeDefined();
      expect(pack.priceUsd).toBeGreaterThan(tier!.priceUsd);
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

  it("makes each bigger plan cheaper per credit than the one below it", () => {
    // Volume has to buy a discount, or there is no reason to move up a tier.
    const rates = CREDIT_TIERS.map((t) => perCredit(t.priceUsd, t.monthlyCredits));
    for (let i = 1; i < rates.length; i += 1) {
      expect(rates[i]).toBeLessThan(rates[i - 1]);
    }
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
