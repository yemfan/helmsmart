import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { CREDIT_TIERS } from "@/lib/credits/pricing";

/**
 * What plan is this account actually on?
 *
 * Stripe is the source of truth — the local `leadsmart_users` columns proved
 * unreliable (they carried stale `plan`/`subscription_status` values from the
 * pre-credits tier system with no subscription behind them). We look up the
 * customer's live subscriptions instead, and fall back to pay-as-you-go, which
 * is a real state here: everything is included and credits can be bought
 * outright without any subscription.
 */
export type CurrentPlan = {
  /** null = pay-as-you-go (no subscription). */
  planId: string | null;
  name: string;
  priceUsd: number | null;
  monthlyCredits: number | null;
  /** ISO timestamp of the next renewal, when subscribed. */
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  status: string | null;
};

/**
 * No subscription.
 *
 * Called "Free" because that is what `/plans` sells and what the agent chose.
 * It read "Pay-as-you-go" until 2026-09-01, which described the mechanism
 * rather than the plan and meant the pricing page and the dashboard used two
 * names for one thing — visible to the same person in the same session, which
 * makes a product look like it does not know itself.
 *
 * Someone here may also have bought top-up packs; that is still the Free tier
 * with credits on it, not a different plan.
 */
const FREE_PLAN: CurrentPlan = {
  planId: null,
  name: "Free",
  priceUsd: null,
  monthlyCredits: null,
  renewsAt: null,
  cancelAtPeriodEnd: false,
  status: null,
};

/** Active-ish states we still present as "you have this plan". */
const LIVE = new Set(["active", "trialing", "past_due"]);

export async function getCurrentPlan(userId: string): Promise<CurrentPlan> {
  const { data } = await supabaseAdmin
    .from("leadsmart_users")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  const customerId = (data as { stripe_customer_id?: string | null } | null)?.stripe_customer_id;
  if (!customerId) return FREE_PLAN;

  let subs;
  try {
    subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
      // The product name is the fallback plan label for subscriptions that
      // predate the credit tiers (legacy CRM ladder) — "Signature" beats
      // "Subscribed" on the billing card.
      expand: ["data.items.data.price.product"],
    });
  } catch {
    return FREE_PLAN; // Stripe unreachable — don't invent a plan.
  }

  const sub = subs.data.find((s) => LIVE.has(s.status));
  if (!sub) return FREE_PLAN;

  // Match the subscribed price back to our catalog. Prefer the plan recorded in
  // metadata at checkout; fall back to the price id.
  const metaPlan = (sub.metadata?.plan as string | undefined)?.toLowerCase();
  const firstItem = sub.items.data[0];
  const priceId = firstItem?.price?.id;
  const tier =
    CREDIT_TIERS.find((t) => t.id === metaPlan) ??
    // `priceId` must be checked: without it an unset env var is `undefined` on
    // both sides and every tier "matches", silently reporting Starter.
    (priceId ? CREDIT_TIERS.find((t) => process.env[t.priceEnv]?.trim() === priceId) : undefined);

  // Stripe moved this in 2025-04-30.basil: the billing period now lives on the
  // subscription ITEM, and the top-level field is absent. We pin
  // 2025-08-27.basil, so reading only the old location returned undefined every
  // time and the renewal date silently vanished from the billing card.
  // Verified against the live API: top-level `current_period_end` was null on
  // every subscription returned, including active ones, while
  // `items.data[0].current_period_end` carried the real timestamp.
  // `lib/billing/stripeSubscriptionSync.ts` already reads both; this did not.
  const subPeriod = sub as unknown as { current_period_end?: number };
  const itemPeriod = firstItem as unknown as { current_period_end?: number } | undefined;
  const periodEnd = subPeriod.current_period_end ?? itemPeriod?.current_period_end;

  const product = firstItem?.price?.product;
  const productName =
    product && typeof product === "object" && "name" in product && typeof product.name === "string"
      ? product.name
      : null;
  const metaName = metaPlan
    ? metaPlan.replace(/^crm_/, "").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  return {
    planId: tier?.id ?? metaPlan ?? "unknown",
    name: tier?.name ?? productName ?? metaName ?? "Subscribed",
    priceUsd: tier?.priceUsd ?? null,
    monthlyCredits: tier?.monthlyCredits ?? null,
    renewsAt: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end === true,
    status: sub.status,
  };
}
