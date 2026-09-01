import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
  checkoutPaymentIndicatesSuccess,
  checkoutSuccessShouldSyncSubscription,
  computeAgentPlanFromSubscriptionSync,
  resolvePaidPlanFromStripe,
  subscriptionStatusIndicatesPaidAccess,
} from "./stripeSubscriptionApply";

function mockSubscription(
  status: Stripe.Subscription["status"],
  opts?: { priceId?: string; planMeta?: string; internalPlan?: string }
): Stripe.Subscription {
  const metadata: Record<string, string> = {};
  if (opts?.planMeta) metadata.plan = opts.planMeta;
  if (opts?.internalPlan) metadata.internal_plan = opts.internalPlan;
  return {
    status,
    items: { data: [{ price: { id: opts?.priceId ?? undefined } }] },
    metadata,
  } as unknown as Stripe.Subscription;
}

describe("checkoutPaymentIndicatesSuccess", () => {
  it("accepts paid", () => {
    expect(checkoutPaymentIndicatesSuccess("paid")).toBe(true);
  });
  it("accepts no_payment_required", () => {
    expect(checkoutPaymentIndicatesSuccess("no_payment_required")).toBe(true);
  });
  it("rejects unpaid", () => {
    expect(checkoutPaymentIndicatesSuccess("unpaid")).toBe(false);
  });
  it("rejects undefined", () => {
    expect(checkoutPaymentIndicatesSuccess(undefined)).toBe(false);
  });
});

describe("subscriptionStatusIndicatesPaidAccess", () => {
  it("active and trialing are paid-capable", () => {
    expect(subscriptionStatusIndicatesPaidAccess("active")).toBe(true);
    expect(subscriptionStatusIndicatesPaidAccess("trialing")).toBe(true);
  });
  it("other statuses are not", () => {
    expect(subscriptionStatusIndicatesPaidAccess("past_due")).toBe(false);
    expect(subscriptionStatusIndicatesPaidAccess("canceled")).toBe(false);
    expect(subscriptionStatusIndicatesPaidAccess("unpaid")).toBe(false);
    expect(subscriptionStatusIndicatesPaidAccess("incomplete")).toBe(false);
    expect(subscriptionStatusIndicatesPaidAccess("incomplete_expired")).toBe(false);
  });
});

describe("checkoutSuccessShouldSyncSubscription (paid vs unpaid gate)", () => {
  it("allows standard paid checkout", () => {
    expect(
      checkoutSuccessShouldSyncSubscription({
        paymentStatus: "paid",
        subscriptionStatus: "active",
      })
    ).toBe(true);
  });
  it("allows no_payment_required with active sub", () => {
    expect(
      checkoutSuccessShouldSyncSubscription({
        paymentStatus: "no_payment_required",
        subscriptionStatus: "active",
      })
    ).toBe(true);
  });
  it("allows trialing when session payment_status is unpaid (trial edge case)", () => {
    expect(
      checkoutSuccessShouldSyncSubscription({
        paymentStatus: "unpaid",
        subscriptionStatus: "trialing",
      })
    ).toBe(true);
  });
  it("blocks truly incomplete unpaid checkout", () => {
    expect(
      checkoutSuccessShouldSyncSubscription({
        paymentStatus: "unpaid",
        subscriptionStatus: "incomplete",
      })
    ).toBe(false);
  });
  it("blocks unpaid + past_due", () => {
    expect(
      checkoutSuccessShouldSyncSubscription({
        paymentStatus: "unpaid",
        subscriptionStatus: "past_due",
      })
    ).toBe(false);
  });
});

describe("computeAgentPlanFromSubscriptionSync", () => {
  it("downgrades to free when subscription is not active/trialing", () => {
    expect(
      computeAgentPlanFromSubscriptionSync({
        subscriptionStatus: "canceled",
        resolvedPaidPlan: "premium",
      })
    ).toBe("free");
    expect(
      computeAgentPlanFromSubscriptionSync({
        subscriptionStatus: "unpaid",
        resolvedPaidPlan: "premium",
      })
    ).toBe("free");
  });
  it("maps active + resolved premium to premium", () => {
    expect(
      computeAgentPlanFromSubscriptionSync({
        subscriptionStatus: "active",
        resolvedPaidPlan: "premium",
      })
    ).toBe("premium");
  });
  it("passes an unidentified SKU through as null instead of guessing pro", () => {
    // This default is how a $59 Signature subscriber ended up cached as `pro`:
    // the live CloseBoss price wasn't in the map, so the guess got written as
    // if it were a reading. The caller now leaves the cache untouched.
    expect(
      computeAgentPlanFromSubscriptionSync({
        subscriptionStatus: "active",
        resolvedPaidPlan: null,
      })
    ).toBeNull();
  });

  it("keeps free as free — a resolved free plan is an answer, not a gap", () => {
    expect(
      computeAgentPlanFromSubscriptionSync({
        subscriptionStatus: "active",
        resolvedPaidPlan: "free",
      })
    ).toBe("free");
  });
  it("trialing + pro stays pro", () => {
    expect(
      computeAgentPlanFromSubscriptionSync({
        subscriptionStatus: "trialing",
        resolvedPaidPlan: "pro",
      })
    ).toBe("pro");
  });
});

describe("resolvePaidPlanFromStripe", () => {
  let prevPro: string | undefined;
  let prevConsumerPremium: string | undefined;

  beforeEach(() => {
    prevPro = process.env.STRIPE_PRICE_ID_PRO;
    prevConsumerPremium = process.env.STRIPE_PRICE_ID_CONSUMER_PREMIUM;
    process.env.STRIPE_PRICE_ID_PRO = "price_pro_test";
    process.env.STRIPE_PRICE_ID_CONSUMER_PREMIUM = "price_premium_test";
  });

  afterEach(() => {
    if (prevPro === undefined) delete process.env.STRIPE_PRICE_ID_PRO;
    else process.env.STRIPE_PRICE_ID_PRO = prevPro;
    if (prevConsumerPremium === undefined) delete process.env.STRIPE_PRICE_ID_CONSUMER_PREMIUM;
    else process.env.STRIPE_PRICE_ID_CONSUMER_PREMIUM = prevConsumerPremium;
  });

  it("uses env price id for pro", () => {
    expect(resolvePaidPlanFromStripe(mockSubscription("active", { priceId: "price_pro_test" }))).toBe("pro");
  });
  it("does not credit a homeowner product as an agent plan", () => {
    // STRIPE_PRICE_ID_CONSUMER_PREMIUM is the homeowner SKU. It used to set the
    // agent's plan cache to `premium`; an agent who also buys the consumer
    // product has not thereby bought an agent tier. Matches the decision
    // planRank already makes for `consumer_premium`.
    expect(resolvePaidPlanFromStripe(mockSubscription("active", { priceId: "price_premium_test" }))).toBe(
      "free"
    );
  });

  it("refuses to place a priced-but-unmapped SKU, rather than inventing a tier", () => {
    const sub = mockSubscription("active", { priceId: "price_not_in_any_map" });
    (sub.items.data[0].price as { unit_amount?: number }).unit_amount = 5900;
    expect(resolvePaidPlanFromStripe(sub)).toBeNull();
  });
  it("uses subscription metadata when price id unknown", () => {
    expect(resolvePaidPlanFromStripe(mockSubscription("active", { planMeta: "premium" }))).toBe("premium");
  });
  it("prefers checkout metadata over subscription when price unknown", () => {
    expect(resolvePaidPlanFromStripe(mockSubscription("active", { planMeta: "ignored" }), "pro")).toBe("pro");
  });
  it("returns free when nothing matches", () => {
    expect(resolvePaidPlanFromStripe(mockSubscription("active", { priceId: "price_unknown" }))).toBe("free");
  });

  describe("v2.0 internal_plan resolution (legacy 3-value collapse)", () => {
    it("crm_starter → free (Starter IS the free tier in v2.0)", () => {
      expect(
        resolvePaidPlanFromStripe(mockSubscription("active", { internalPlan: "crm_starter" }))
      ).toBe("free");
    });

    it("crm_pro → pro ($49 tier)", () => {
      expect(
        resolvePaidPlanFromStripe(mockSubscription("active", { internalPlan: "crm_pro" }))
      ).toBe("pro");
    });

    it("crm_premium → premium ($99 tier)", () => {
      expect(
        resolvePaidPlanFromStripe(mockSubscription("active", { internalPlan: "crm_premium" }))
      ).toBe("premium");
    });

    it("crm_signature → premium (legacy collapse; signature gates via subscriptions.plan)", () => {
      expect(
        resolvePaidPlanFromStripe(mockSubscription("active", { internalPlan: "crm_signature" }))
      ).toBe("premium");
    });

    it("crm_team → premium (legacy collapse; team gates via subscriptions.plan)", () => {
      expect(
        resolvePaidPlanFromStripe(mockSubscription("active", { internalPlan: "crm_team" }))
      ).toBe("premium");
    });

    it("annual price IDs resolve same as monthly counterparts", () => {
      const prev = process.env.STRIPE_PRICE_ID_SIGNATURE_ANNUAL;
      process.env.STRIPE_PRICE_ID_SIGNATURE_ANNUAL = "price_sig_yr";
      try {
        expect(
          resolvePaidPlanFromStripe(mockSubscription("active", { priceId: "price_sig_yr" }))
        ).toBe("premium");
      } finally {
        if (prev === undefined) delete process.env.STRIPE_PRICE_ID_SIGNATURE_ANNUAL;
        else process.env.STRIPE_PRICE_ID_SIGNATURE_ANNUAL = prev;
      }
    });
  });
});
