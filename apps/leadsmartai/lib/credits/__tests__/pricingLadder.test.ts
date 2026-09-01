import { describe, expect, it } from "vitest";

import {
  CREDIT_COSTS,
  CREDIT_TIERS,
  FREE_TIER,
  WELCOME_CREDITS,
  approxCallMinutes,
  approxVideos,
} from "@/lib/credits/pricing";

/**
 * The economics of the price list, pinned.
 *
 * These numbers drifted twice before — blurbs claiming minute counts the rate
 * no longer supported, and a per-minute cost "inferred backwards and labelled
 * measured". Copy is no longer allowed to carry quantities, so this is where
 * the arithmetic is defended instead.
 */

/** Measured from the Retell invoice, 2026-08-18: $0.151/min all-in. */
const VOICE_COST_PER_MIN = 0.151;
/** ~$0.02 of cost per credit for video, the expensive way to spend one. */
const VIDEO_COST_PER_CREDIT = 0.02;

const rate = (t: { priceUsd: number; monthlyCredits: number }) =>
  t.priceUsd / t.monthlyCredits;

describe("the ladder", () => {
  it("is the four paid tiers the price list advertises", () => {
    expect(CREDIT_TIERS.map((t) => [t.id, t.priceUsd, t.monthlyCredits])).toEqual([
      ["solo", 79, 800],
      ["pro", 159, 2000],
      ["premium", 299, 4000],
      ["signature", 399, 4000],
    ]);
  });

  it("keeps free out of the purchasable list", () => {
    // CREDIT_TIERS drives Stripe checkout; every row needs a price id, and
    // free has none. A free row here would surface a broken buy button.
    expect(CREDIT_TIERS.some((t) => t.priceUsd === 0)).toBe(false);
    expect(FREE_TIER.priceUsd).toBe(0);
    expect(FREE_TIER.monthlyCredits).toBe(100);
  });

});

describe("volume actually gets cheaper", () => {
  it("drops the per-credit rate at each step up to Premium", () => {
    const [solo, pro, premium] = CREDIT_TIERS;
    expect(rate(pro)).toBeLessThan(rate(solo));
    expect(rate(premium)).toBeLessThan(rate(pro));
  });

  it("prices Signature above Premium per credit, because it buys people", () => {
    // Same allowance, +$100 for onboarding and a named contact. The rate is
    // higher and that is honest — it is not a capacity purchase.
    const premium = CREDIT_TIERS.find((t) => t.id === "premium")!;
    const signature = CREDIT_TIERS.find((t) => t.id === "signature")!;
    expect(signature.monthlyCredits).toBe(premium.monthlyCredits);
    expect(rate(signature)).toBeGreaterThan(rate(premium));
    expect(signature.setupFeeUsd).toBe(499);
  });
});

describe("margins hold at the worst case", () => {
  // Worst case is every credit spent on video, the most expensive use.
  it("keeps every paid tier above 70% gross margin", () => {
    for (const tier of CREDIT_TIERS) {
      const cogs = tier.monthlyCredits * VIDEO_COST_PER_CREDIT;
      const margin = (tier.priceUsd - cogs) / tier.priceUsd;
      expect(margin, `${tier.id} margin`).toBeGreaterThan(0.7);
    }
  });

  it("keeps the free tier under $2.50 a month to serve", () => {
    // The number that decides whether a permanent free tier is affordable.
    const worst = FREE_TIER.monthlyCredits * VIDEO_COST_PER_CREDIT;
    expect(worst).toBeLessThan(2.5);
  });

  it("keeps an all-voice month cheaper to serve than an all-video one", () => {
    // Voice carries roughly twice the margin. If this ever inverts, the
    // 8-credit rate needs revisiting, not the plan prices.
    const solo = CREDIT_TIERS.find((t) => t.id === "solo")!;
    const voiceCost = approxCallMinutes(solo.monthlyCredits) * VOICE_COST_PER_MIN;
    const videoCost = solo.monthlyCredits * VIDEO_COST_PER_CREDIT;
    expect(voiceCost).toBeLessThan(videoCost);
  });
});

describe("what a plan actually buys", () => {
  it("puts Solo at 100 voice minutes — the competitive number", () => {
    // At the old 15 credits/min this was 53 minutes, against standalone AI
    // receptionists selling 150-250 for $49-109. That comparison was lost on
    // the headline figure before the rate moved.
    expect(CREDIT_COSTS.voicePerMinute).toBe(8);
    expect(approxCallMinutes(800)).toBe(100);
    expect(approxCallMinutes(2000)).toBe(250);
    expect(approxCallMinutes(4000)).toBe(500);
  });

  it("gives the free tier enough to hear the receptionist at least once", () => {
    expect(approxCallMinutes(FREE_TIER.monthlyCredits)).toBeGreaterThanOrEqual(10);
    // And the welcome grant is what makes a real first session possible.
    expect(approxCallMinutes(WELCOME_CREDITS)).toBeGreaterThanOrEqual(30);
  });

  it("still affords a meaningful number of videos", () => {
    expect(approxVideos(800, "twinAvatar")).toBe(40);
    expect(approxVideos(800, "listingClip")).toBe(53);
  });
});
