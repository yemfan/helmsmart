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

/**
 * Where an invoice points at its subscription — and the metadata we stamped on
 * that subscription at checkout.
 *
 * Stripe MOVED this: on current API versions `invoice.subscription` is null and
 * the reference lives at `invoice.parent.subscription_details` (which also
 * carries the subscription's metadata, so the happy path needs no extra API
 * call). The legacy top-level field is still read as a fallback for older
 * event payloads.
 */
function subscriptionRefFromInvoice(invoice: Stripe.Invoice): {
  id: string | null;
  metadata: Record<string, string> | null;
} {
  const inv = invoice as unknown as {
    subscription?: string | { id?: string } | null;
    parent?: {
      subscription_details?: {
        subscription?: string | { id?: string } | null;
        metadata?: Record<string, string> | null;
      } | null;
    } | null;
  };

  const details = inv.parent?.subscription_details ?? null;
  const raw = details?.subscription ?? inv.subscription ?? null;
  const id = !raw ? null : typeof raw === "string" ? raw : (raw.id ?? null);

  return { id, metadata: details?.metadata ?? null };
}

/**
 * Grant a plan's monthly credits for a paid invoice. Fires for the first
 * subscription invoice AND every renewal; idempotent on the invoice id so each
 * billing period grants exactly once. Best-effort + no-op when the plan/user
 * can't be resolved (e.g. a legacy subscription with no metadata).
 */
export async function grantMonthlyCreditsForInvoice(invoice: Stripe.Invoice): Promise<void> {
  const ref = subscriptionRefFromInvoice(invoice);
  if (!ref.id) return;

  // Prefer the metadata the invoice already carries; only call the API when the
  // payload didn't include it (older/partial event shapes).
  let meta = ref.metadata;
  if (!meta?.user_id || !meta?.plan) {
    try {
      const sub = await stripe.subscriptions.retrieve(ref.id);
      meta = (sub.metadata ?? null) as Record<string, string> | null;
    } catch {
      return;
    }
  }

  const userId = meta?.user_id;
  const plan = meta?.plan;
  if (!userId || !plan) return;

  let credits = monthlyCreditsForPlan(plan);

  // A mid-cycle plan change bills only the PRORATED difference, so it should
  // grant only the difference in credits — the user already received the old
  // plan's allotment for this period. Stripe flags these invoices with
  // billing_reason "subscription_update"; `prev_credits` is stamped onto the
  // subscription metadata when we perform the switch.
  const billingReason = (invoice as unknown as { billing_reason?: string | null }).billing_reason;
  if (billingReason === "subscription_update") {
    const prev = Number.parseInt(meta?.prev_credits ?? "", 10);
    const delta = credits - (Number.isFinite(prev) ? prev : 0);
    // Downgrades (delta <= 0) keep the credits already granted — we never claw back.
    if (delta <= 0) return;
    credits = delta;
  }

  if (credits <= 0) return;

  // ref = invoice id → one grant per billing period, replay-safe.
  await grantCredits(userId, credits, "monthly_grant", invoice.id).catch(() => {});
}
