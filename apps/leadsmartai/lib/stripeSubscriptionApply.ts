import type Stripe from "stripe";
import { tierOf } from "@/lib/billing/planRank";
import { resolveInternalPlanFromStripeSubscription } from "@/lib/billing/stripe-plan-map";
import { supabaseServer } from "@/lib/supabaseServer";
import { throwIfSupabaseError } from "@/lib/supabaseThrow";
import { setUserPlanFromStripe, type Plan } from "@/lib/subscriptionSync";

/** Checkout Session: customer completed payment or no charge is due yet (e.g. trial). */
export function checkoutPaymentIndicatesSuccess(
  paymentStatus: Stripe.Checkout.Session["payment_status"] | null | undefined
): boolean {
  return paymentStatus === "paid" || paymentStatus === "no_payment_required";
}

/** Subscription row: entitled to paid features in our app. */
export function subscriptionStatusIndicatesPaidAccess(
  status: Stripe.Subscription["status"]
): boolean {
  return status === "active" || status === "trialing";
}

/**
 * After Checkout redirect: allow syncing DB if payment looks OK *or* Stripe already put the
 * subscription in a paid-capable state (covers trial flows where `payment_status` may be `unpaid`).
 */
export function checkoutSuccessShouldSyncSubscription(params: {
  paymentStatus: Stripe.Checkout.Session["payment_status"] | null | undefined;
  subscriptionStatus: Stripe.Subscription["status"];
}): boolean {
  return (
    checkoutPaymentIndicatesSuccess(params.paymentStatus) ||
    subscriptionStatusIndicatesPaidAccess(params.subscriptionStatus)
  );
}

/** Maps Stripe subscription status + resolved SKU to the plan cached on `agents` / `leadsmart_users`. */
export function computeAgentPlanFromSubscriptionSync(params: {
  subscriptionStatus: Stripe.Subscription["status"];
  resolvedPaidPlan: "pro" | "premium" | "free" | null;
}): "free" | "pro" | "premium" | null {
  if (!subscriptionStatusIndicatesPaidAccess(params.subscriptionStatus)) return "free";
  // `null` means "this price maps to nothing we know". It used to mean `pro`,
  // which is how a $59 Signature subscriber ended up cached as Pro: the price
  // wasn't in the map, so the guess was written as if it were a reading.
  // Propagate the uncertainty instead — the caller leaves the cache alone.
  return params.resolvedPaidPlan;
}

/**
 * Collapse the canonical `InternalPlan` onto the legacy three-value cache kept
 * in `agents.plan_type` / `leadsmart_users.plan`.
 *
 * These columns no longer gate anything — `billing_subscriptions` does, via
 * `getActiveCrmSubscription`. They are kept in step because plenty of read-only
 * surfaces (admin lists, signup reports) still display them.
 *
 * Returns `null` when the subscription's price maps to nothing. There is no
 * safe three-value answer for an unknown paid SKU, and inventing one is what
 * this function used to do.
 */
export function resolvePaidPlanFromStripe(
  subscription: Stripe.Subscription,
  checkoutPlanMeta?: string | null
): "pro" | "premium" | "free" | null {
  const priceId = subscription.items.data[0]?.price?.id ?? null;
  // ONE price map for the whole codebase. This used to keep a second, narrower
  // copy that omitted the live CloseBoss price ids entirely — so every CB
  // checkout fell through it, including the first real paying customer's.
  const internalPlan = resolveInternalPlanFromStripeSubscription(priceId, subscription.metadata);

  if (internalPlan === "consumer_free") {
    // Legacy checkouts wrote the tier straight into `metadata.plan`. Matched
    // EXACTLY, and only against the two legacy values — CloseBoss checkouts put
    // their credit tier there ("starter"/"growth"/"scale"), and reading
    // "growth" as a plan hint is the kind of near-miss that starts this whole
    // class of bug over again.
    const hint = String(checkoutPlanMeta ?? subscription.metadata?.plan ?? "")
      .trim()
      .toLowerCase();
    if (hint === "pro" || hint === "premium") return hint;

    // `consumer_free` is also this mapper's "no idea" answer, so a genuinely
    // priced subscription landing here is an unmapped SKU, not a free plan.
    const amount = subscription.items.data[0]?.price?.unit_amount ?? 0;
    if (amount > 0) {
      console.error("[billing] unmapped Stripe price — plan cache left unchanged", {
        subscriptionId: subscription.id,
        priceId,
        unitAmount: amount,
        metadata: subscription.metadata,
        hint: checkoutPlanMeta ?? null,
      });
      return null;
    }
    return "free";
  }

  const tier = tierOf(internalPlan);
  if (!tier) return null;
  if (tier === "free" || tier === "starter") return "free";
  if (tier === "pro") return "pro";
  // premium / signature / team all collapse onto `premium` — the cache only has
  // three values, and the real tier lives on the billing row.
  return "premium";
}

/**
 * Updates `agents` + `user_profiles` from a Stripe subscription (webhook or return from Checkout).
 */
export async function persistAgentAndProfileFromSubscription(params: {
  userId: string | null;
  customerId: string | null;
  subscriptionId: string;
  subscription: Stripe.Subscription;
  checkoutPlanMeta?: string | null;
}): Promise<void> {
  const sub = params.subscription;
  const status = sub.status;
  const paidPlan = resolvePaidPlanFromStripe(sub, params.checkoutPlanMeta);
  const agentPlan = computeAgentPlanFromSubscriptionSync({
    subscriptionStatus: status,
    resolvedPaidPlan: paidPlan,
  });

  const trialEndsAt =
    sub.trial_end != null ? new Date(sub.trial_end * 1000).toISOString() : null;

  if (params.userId) {
    const { data: existingAgent, error: selAgentErr } = await supabaseServer
      .from("agents")
      .select("id")
      .eq("auth_user_id", params.userId)
      .maybeSingle();
    throwIfSupabaseError(selAgentErr, "Could not load agents row");

    // An unidentified SKU (`agentPlan === null`) still updates the Stripe ids —
    // those are facts — but leaves `plan_type` alone. Overwriting a known plan
    // with a guess is what put `pro` on a Signature account.
    const agentPayload = {
      ...(agentPlan === null ? {} : { plan_type: agentPlan }),
      stripe_customer_id: params.customerId ?? null,
      stripe_subscription_id: params.subscriptionId,
    };

    if (existingAgent) {
      const { error } = await supabaseServer.from("agents").update(agentPayload).eq("auth_user_id", params.userId);
      if (error) throw error;
    } else {
      const { error } = await supabaseServer.from("agents").insert({
        auth_user_id: params.userId,
        ...agentPayload,
      } as Record<string, unknown>);
      if (error) throw error;
    }

    const profilePlan: Plan | null = agentPlan;
    await setUserPlanFromStripe({
      userId: params.userId,
      plan: profilePlan,
      subscriptionStatus: status,
      stripeCustomerId: params.customerId ?? null,
      stripeSubscriptionId: params.subscriptionId,
      resetTokens: agentPlan === "free",
      trialEndsAt,
    });
    return;
  }

  if (params.customerId) {
    const { error } = await supabaseServer
      .from("agents")
      .update({
        ...(agentPlan === null ? {} : { plan_type: agentPlan }),
        stripe_customer_id: params.customerId ?? null,
        stripe_subscription_id: params.subscriptionId,
      })
      .eq("stripe_customer_id", params.customerId);
    throwIfSupabaseError(error, "Could not update agents by customer id");
  }
}
