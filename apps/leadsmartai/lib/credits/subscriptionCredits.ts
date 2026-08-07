import "server-only";

import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { grantCredits } from "@/lib/credits/ledger";
import { CREDIT_TIERS } from "@/lib/credits/pricing";

/**
 * Monthly-subscription credit grants for the usage model. The new credit plans
 * (Starter/Growth/Scale) REPLACE the old Pro/Premium tiers; subscribing grants
 * that plan's monthly credit allotment. Legacy plan slugs map to the nearest
 * new plan so existing subscribers start receiving credits on their next
 * renewal (their up-front "grandfather" catch-up is a one-off launch grant).
 */

/** Monthly credit allotment for a plan slug (new tiers + legacy fallbacks). */
export function monthlyCreditsForPlan(plan: string | null | undefined): number {
  if (!plan) return 0;
  const p = plan.toLowerCase();
  const tier = CREDIT_TIERS.find((t) => t.id === p);
  if (tier) return tier.monthlyCredits;
  switch (p) {
    case "pro":
      return 3000; // → Growth
    case "premium":
    case "signature":
    case "team":
      return 8000; // → Scale
    case "starter":
    case "free":
    default:
      return 0;
  }
}

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const s = (invoice as unknown as { subscription?: string | { id?: string } | null }).subscription;
  if (!s) return null;
  return typeof s === "string" ? s : (s.id ?? null);
}

/**
 * Grant a plan's monthly credits for a paid invoice. Fires for the first
 * subscription invoice AND every renewal; idempotent on the invoice id so each
 * billing period grants exactly once. Best-effort + no-op when the plan/user
 * can't be resolved (e.g. a legacy subscription with no metadata).
 */
export async function grantMonthlyCreditsForInvoice(invoice: Stripe.Invoice): Promise<void> {
  const subId = subscriptionIdFromInvoice(invoice);
  if (!subId) return;

  let sub: Stripe.Subscription;
  try {
    sub = await stripe.subscriptions.retrieve(subId);
  } catch {
    return;
  }

  const userId = (sub.metadata?.user_id as string | undefined) ?? undefined;
  const plan = (sub.metadata?.plan as string | undefined) ?? undefined;
  if (!userId || !plan) return;

  const credits = monthlyCreditsForPlan(plan);
  if (credits <= 0) return;

  // ref = invoice id → one grant per billing period, replay-safe.
  await grantCredits(userId, credits, "monthly_grant", invoice.id).catch(() => {});
}
