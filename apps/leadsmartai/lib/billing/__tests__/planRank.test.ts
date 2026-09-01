import { describe, expect, it } from "vitest";

import {
  PLAN_RANK,
  meetsPlan,
  resolvePlanTier,
  tierOf,
  tierToPlanSlug,
} from "@/lib/billing/planRank";
import { PLANS } from "@/lib/billing/plans";

/**
 * These used to encode "when the four plan columns disagree, the highest wins".
 * There are no longer four columns: `billing_subscriptions.plan` is the source
 * of truth and its `InternalPlan` vocabulary is the only one ranked here.
 *
 * What survives is ranking over ROWS, because a user can legitimately hold more
 * than one active subscription.
 */

describe("tierOf", () => {
  it("reads the canonical InternalPlan vocabulary", () => {
    expect(tierOf("crm_starter")).toBe("starter");
    expect(tierOf("crm_pro")).toBe("pro");
    expect(tierOf("crm_premium")).toBe("premium");
    expect(tierOf("crm_signature")).toBe("signature");
    expect(tierOf("crm_team")).toBe("team");
  });

  it("stays in step with the plan catalog", () => {
    // The crm_* half of the map is derived from PLANS rather than restated, so
    // a renamed tier cannot drift between the two files.
    for (const slug of Object.keys(PLANS) as Array<keyof typeof PLANS>) {
      expect(tierOf(PLANS[slug].internalPlan)).toBe(slug);
    }
  });

  it("maps the retired agent SKUs to what they actually cost", () => {
    // agent_starter was the $49 product and agent_pro the $99 one, matching
    // Pro and Premium. Reading them as Starter and Pro — which the previous
    // map did — under-grants a legacy subscriber by a full tier.
    expect(tierOf("agent_starter")).toBe("pro");
    expect(tierOf("agent_pro")).toBe("premium");
    expect(tierOf("loan_broker_pro")).toBe("pro");
  });

  it("treats the homeowner products as NOT an agent entitlement", () => {
    expect(tierOf("consumer_free")).toBe("free");
    expect(tierOf("consumer_premium")).toBe("free");
  });

  it("normalises case and whitespace", () => {
    expect(tierOf("  CRM_TEAM  ")).toBe("team");
  });

  it("returns null for silence, not free", () => {
    // "This row says nothing" and "this person pays nothing" are different
    // claims, and only one of them should be able to lose a vote.
    expect(tierOf(null)).toBeNull();
    expect(tierOf("")).toBeNull();
    expect(tierOf("   ")).toBeNull();
    expect(tierOf("some_future_plan")).toBeNull();
  });

  it("no longer answers for the legacy cache vocabulary", () => {
    // `pro` / `premium` are what agents.plan_type holds. Those columns are
    // caches now; ranking them is what made four sources look like four
    // opinions.
    expect(tierOf("pro")).toBeNull();
    expect(tierOf("premium")).toBeNull();
  });
});

describe("resolvePlanTier", () => {
  it("takes the highest of several rows", () => {
    expect(resolvePlanTier(["crm_pro", "crm_signature"])).toBe("signature");
  });

  it("is not fooled by a consumer row sitting alongside the real one", () => {
    expect(resolvePlanTier(["crm_signature", "consumer_free"])).toBe("signature");
  });

  it("ignores unknown spellings rather than counting them as free", () => {
    expect(resolvePlanTier(["mystery_tier", "crm_premium"])).toBe("premium");
  });

  it("falls back to free when nothing is known", () => {
    expect(resolvePlanTier([])).toBe("free");
    expect(resolvePlanTier([null, "", undefined])).toBe("free");
    expect(resolvePlanTier(["unrecognised"])).toBe("free");
  });

  it("does not care what order the rows arrive in", () => {
    const values = ["crm_signature", "consumer_free", "crm_pro", null];
    expect(resolvePlanTier(values)).toBe(resolvePlanTier([...values].reverse()));
  });
});

describe("meetsPlan", () => {
  it("lets a higher tier through a lower gate", () => {
    expect(meetsPlan("signature", "premium")).toBe(true);
    expect(meetsPlan("premium", "premium")).toBe(true);
    expect(meetsPlan("team", "premium")).toBe(true);
  });

  it("stops a lower tier", () => {
    expect(meetsPlan("pro", "premium")).toBe(false);
    expect(meetsPlan("free", "starter")).toBe(false);
  });

  it("every tier meets free", () => {
    for (const tier of PLAN_RANK) expect(meetsPlan(tier, "free")).toBe(true);
  });
});

describe("tierToPlanSlug", () => {
  it("maps free onto starter — they are the same product", () => {
    expect(tierToPlanSlug("free")).toBe("starter");
    expect(PLANS.starter.price).toBe(0);
  });

  it("is identity for every paid tier", () => {
    expect(tierToPlanSlug("pro")).toBe("pro");
    expect(tierToPlanSlug("premium")).toBe("premium");
    expect(tierToPlanSlug("signature")).toBe("signature");
    expect(tierToPlanSlug("team")).toBe("team");
  });
});
