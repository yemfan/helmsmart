import { describe, expect, it } from "vitest";

import {
  PLAN_RANK,
  meetsPlan,
  plansDisagree,
  resolvePlanTier,
  tierOf,
} from "@/lib/billing/planRank";

/**
 * These encode a decision, not just a mapping: when the four plan fields
 * disagree, the HIGHEST wins.
 *
 * The case that forced it is real. Agent 26 — the only paying account — reads
 * `pro` on agents.plan_type, `premium` on agents.subscription_plan and
 * leadsmart_users.plan, and `crm_signature` on an active billing row. Gating on
 * plan_type would tell a Signature customer to upgrade.
 */

describe("tierOf", () => {
  it("understands every vocabulary the four sources use", () => {
    expect(tierOf("pro")).toBe("pro");
    expect(tierOf("crm_signature")).toBe("signature");
    expect(tierOf("agent_pro")).toBe("pro");
    expect(tierOf("PREMIUM")).toBe("premium");
    expect(tierOf("  crm_team  ")).toBe("team");
  });

  it("treats the homeowner products as NOT an agent entitlement", () => {
    // An agent who also holds a consumer subscription has not thereby bought
    // an agent tier.
    expect(tierOf("consumer_free")).toBe("free");
    expect(tierOf("consumer_premium")).toBe("free");
  });

  it("returns null for silence, not free", () => {
    // "This source does not know" and "this person pays nothing" are
    // different claims, and only one of them should be able to lose a vote.
    expect(tierOf(null)).toBeNull();
    expect(tierOf("")).toBeNull();
    expect(tierOf("   ")).toBeNull();
    expect(tierOf("some_future_plan")).toBeNull();
  });
});

describe("resolvePlanTier", () => {
  it("resolves agent 26 to signature, the tier actually paid for", () => {
    expect(resolvePlanTier(["pro", "premium", "premium", "crm_signature"])).toBe(
      "signature",
    );
  });

  it("is not fooled by a consumer row sitting alongside the real one", () => {
    // Agent 26 has BOTH crm_signature and consumer_free marked active.
    expect(resolvePlanTier(["crm_signature", "consumer_free"])).toBe("signature");
  });

  it("ignores unknown spellings rather than counting them as free", () => {
    expect(resolvePlanTier(["mystery_tier", "premium"])).toBe("premium");
  });

  it("falls back to free when nothing is known", () => {
    expect(resolvePlanTier([])).toBe("free");
    expect(resolvePlanTier([null, "", undefined])).toBe("free");
    expect(resolvePlanTier(["unrecognised"])).toBe("free");
  });

  it("does not care what order the sources arrive in", () => {
    const values = ["crm_signature", "free", "pro", null];
    expect(resolvePlanTier(values)).toBe(resolvePlanTier([...values].reverse()));
  });

  it("grants rather than denies — the asymmetry that decides the rule", () => {
    // Granting the better tier costs a feature. Denying it costs a customer.
    expect(resolvePlanTier(["free", "crm_premium"])).toBe("premium");
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

describe("plansDisagree", () => {
  it("flags the drift that needs reconciling", () => {
    expect(plansDisagree(["pro", "premium", "crm_signature"])).toBe(true);
  });

  it("is quiet when the sources agree, including through aliases", () => {
    expect(plansDisagree(["premium", "crm_premium"])).toBe(false);
    expect(plansDisagree(["free", "free"])).toBe(false);
  });

  it("does not call a single source a disagreement", () => {
    expect(plansDisagree(["premium", null, "", "unknown_thing"])).toBe(false);
    expect(plansDisagree([])).toBe(false);
  });
});
