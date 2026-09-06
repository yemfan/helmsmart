import { describe, expect, it } from "vitest";
import {
  AI_USAGE_MONTHLY_LIMIT,
  effectiveMonthlyPrice,
  hasFeature,
  PLAN_SLUGS_IN_ORDER,
  PLANS,
  type PlanSlug,
} from "../plans";

describe("plans / v2.0 catalog shape", () => {
  it("contains all five tiers in the documented order", () => {
    expect(PLAN_SLUGS_IN_ORDER).toEqual([
      "starter",
      "pro",
      "premium",
      "signature",
      "team",
    ]);
  });

  it("prices match the v2.0 spec", () => {
    expect(PLANS.starter.price).toBe(0);
    expect(PLANS.pro.price).toBe(79);
    expect(PLANS.premium.price).toBe(199);
    expect(PLANS.signature.price).toBe(399);
    expect(PLANS.team.price).toBe(299);
  });

  it("annual prices reflect 2-months-free framing", () => {
    expect(PLANS.starter.annualPrice).toBeNull();
    expect(PLANS.pro.annualPrice).toBe(790);
    expect(PLANS.premium.annualPrice).toBe(1990);
    expect(PLANS.signature.annualPrice).toBe(3990);
    expect(PLANS.team.annualPrice).toBe(2990);
  });

  it("self-serve paid tiers expose both monthly and annual env var keys", () => {
    const selfServe: PlanSlug[] = ["pro", "premium", "signature"];
    for (const slug of selfServe) {
      expect(PLANS[slug].stripePriceEnvVar).toBeTruthy();
      expect(PLANS[slug].stripePriceEnvVarAnnual).toBeTruthy();
    }
    expect(PLANS.starter.stripePriceEnvVar).toBeNull();
    expect(PLANS.starter.stripePriceEnvVarAnnual).toBeNull();
    // Team is sales-assisted — no self-serve Stripe price IDs.
    expect(PLANS.team.contactSales).toBe(true);
    expect(PLANS.team.stripePriceEnvVar).toBeNull();
    expect(PLANS.team.stripePriceEnvVarAnnual).toBeNull();
  });

  it("Signature has the five Signature-only features the spec promises", () => {
    const sig = PLANS.signature.features;
    expect(sig).toContain("sphere_intelligence_pro");
    expect(sig).toContain("white_glove_onboarding");
    expect(sig).toContain("concierge_support");
    expect(sig).toContain("cultural_calendar");
    expect(sig).toContain("custom_voice_tuning");
  });

  it("opens everything the price list does not differentiate on", () => {
    /*
     * The ladder sells on CREDITS, not on features: every tier's blurb reads
     * "Every feature, one seat". Only four things are actually tier-limited
     * (see the next test), so anything else must be on the free tier too —
     * bilingual AI, predictions, bookkeeping, the AI receptionist.
     */
    for (const f of [
      "basic_crm",
      "ask_max",
      "email_support",
      "bilingual_ai",
      "prediction",
      "bookkeeping",
      "ai_calling",
      "full_ai",
      "automation",
    ] as const) {
      expect(PLANS.starter.features, `starter should carry ${f}`).toContain(f);
      expect(PLANS.solo.features, `solo should carry ${f}`).toContain(f);
    }
  });

  it("limits exactly the four things the price list differentiates on", () => {
    // Facebook ads: Pro and above.
    expect(PLANS.starter.features).not.toContain("facebook_ad_management");
    expect(PLANS.solo.features).not.toContain("facebook_ad_management");
    for (const p of ["pro", "premium", "signature"] as const) {
      expect(PLANS[p].features).toContain("facebook_ad_management");
    }
    // Phone support: Premium and Signature.
    for (const p of ["starter", "solo", "pro"] as const) {
      expect(PLANS[p].features).not.toContain("phone_support");
    }
    for (const p of ["premium", "signature"] as const) {
      expect(PLANS[p].features).toContain("phone_support");
    }
    // Coaching splits by track rather than stacking.
    expect(PLANS.pro.features).toContain("producer_track_coaching");
    expect(PLANS.premium.features).toContain("top_producer_track_coaching");
    expect(PLANS.signature.features).toContain("top_producer_track_coaching");
  });

  it("Signature inherits Top Producer Track coaching", () => {
    expect(PLANS.signature.coachingTier).toBe("Top Producer Track");
    expect(PLANS.signature.features).toContain("top_producer_track_coaching");
  });

  it("Pro keeps the 'popular' badge — Signature does not (separate visual treatment)", () => {
    expect(PLANS.pro.popular).toBe(true);
    expect(PLANS.signature.popular).toBeUndefined();
  });

  it("AI usage limits include signature alongside premium/team", () => {
    expect(AI_USAGE_MONTHLY_LIMIT.starter).toBe(100);
    expect(AI_USAGE_MONTHLY_LIMIT.pro).toBe(5000);
    expect(AI_USAGE_MONTHLY_LIMIT.premium).toBe(999_999);
    expect(AI_USAGE_MONTHLY_LIMIT.signature).toBe(999_999);
    expect(AI_USAGE_MONTHLY_LIMIT.team).toBe(999_999);
  });
});

describe("hasFeature", () => {
  it("gates the tier-limited features and nothing else", () => {
    // The $499 setup specialist is what Signature sells; it stays Signature's.
    expect(hasFeature({ plan: "signature" }, "white_glove_onboarding")).toBe(true);
    expect(hasFeature({ plan: "pro" }, "white_glove_onboarding")).toBe(false);
    // Facebook ads start at Pro.
    expect(hasFeature({ plan: "solo" }, "facebook_ad_management")).toBe(false);
    expect(hasFeature({ plan: "pro" }, "facebook_ad_management")).toBe(true);
    // Everything else is open, including on the free tier.
    expect(hasFeature({ plan: "starter" }, "prediction")).toBe(true);
    expect(hasFeature({ plan: "starter" }, "bookkeeping")).toBe(true);
    expect(hasFeature({ plan: "starter" }, "ai_calling")).toBe(true);
  });

  it("returns false on unknown / null plan", () => {
    expect(hasFeature({ plan: null }, "basic_crm")).toBe(false);
    expect(hasFeature({ plan: "nonsense" }, "basic_crm")).toBe(false);
  });
});

describe("effectiveMonthlyPrice", () => {
  it("monthly cadence returns the monthly price unchanged", () => {
    expect(effectiveMonthlyPrice("pro", "monthly")).toBe(79);
    expect(effectiveMonthlyPrice("signature", "monthly")).toBe(399);
  });

  it("annual cadence returns the per-month equivalent of the annual headline", () => {
    expect(effectiveMonthlyPrice("pro", "annual")).toBeCloseTo(65.83, 2);
    expect(effectiveMonthlyPrice("premium", "annual")).toBeCloseTo(165.83, 2);
    expect(effectiveMonthlyPrice("signature", "annual")).toBeCloseTo(332.5, 2);
    expect(effectiveMonthlyPrice("team", "annual")).toBeCloseTo(249.17, 2);
  });

  it("starter is always 0 regardless of cadence", () => {
    expect(effectiveMonthlyPrice("starter", "monthly")).toBe(0);
    expect(effectiveMonthlyPrice("starter", "annual")).toBe(0);
  });

  it("annual savings vs 12x monthly are exactly 2 months on paid tiers", () => {
    for (const slug of ["pro", "premium", "signature", "team"] as const) {
      const monthly = PLANS[slug].price;
      const annual = PLANS[slug].annualPrice!;
      expect(annual).toBe(monthly * 10);
    }
  });
});
