import type Stripe from "stripe";
import type { InternalPlan } from "@/lib/billing/stripe-plan-map";
import type { BillingCadence, PlanSlug } from "@/lib/billing/plans";
import { recordSubscriptionEvent } from "@/lib/analytics/analyticsEvents";
import { SUBSCRIPTION_EVENT_TYPES } from "@/lib/analytics/eventCatalog";
import { recordFunnelEvent } from "@/lib/funnel/funnelAnalytics";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Maps Stripe subscription rows (CRM + legacy agent SKUs) to public `subscriptions.plan` slugs.
 *
 * Legacy `agent_*` SKUs are bridged onto CRM slugs (`agent_starter` was the
 * $49 product → maps to `pro`; `agent_pro` was the $99 product → maps to
 * `premium`). After v2.0 launch new checkouts always emit `crm_*` plans
 * via `internal_plan` metadata; these legacy mappings keep historical
 * subscriptions resolvable.
 */
export function mapInternalPlanToCrmSlug(plan: InternalPlan): PlanSlug | null {
  switch (plan) {
    case "crm_starter":
      return "starter";
    case "crm_pro":
      return "pro";
    case "crm_premium":
      return "premium";
    case "crm_signature":
      return "signature";
    case "crm_team":
      return "team";
    case "agent_starter":
      return "pro";
    case "agent_pro":
      return "premium";
    default:
      return null;
  }
}

/**
 * Pulls billing cadence from a Stripe Subscription. Checkout sets
 * `metadata.billing_cadence` to `"monthly"` or `"annual"`. We also
 * inspect the price interval as a fallback when metadata is missing
 * (legacy rows pre-v2.0 are always monthly).
 */
function resolveBillingCadence(
  subscription: Stripe.Subscription,
): BillingCadence {
  const raw = String(subscription.metadata?.billing_cadence ?? "").toLowerCase().trim();
  if (raw === "annual" || raw === "monthly") return raw;
  const interval = subscription.items.data[0]?.price?.recurring?.interval;
  if (interval === "year") return "annual";
  return "monthly";
}

function mapStripeStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "canceled";
    case "incomplete":
      return "incomplete";
    case "paused":
      return "incomplete";
    default:
      return "incomplete";
  }
}

export async function syncPublicSubscriptionFromStripe(params: {
  userId: string | null;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  internalPlan: InternalPlan;
  subscription: Stripe.Subscription;
  currentPeriodEnd: string | null;
}): Promise<void> {
  const slug = mapInternalPlanToCrmSlug(params.internalPlan);
  const status = mapStripeStatus(params.subscription.status);

  if (!params.userId) {
    return;
  }

  // `subscriptions.user_id` references the consumer `profiles` table. A
  // CloseBoss agent who never used the consumer app has no such row, and the
  // upsert below would violate the foreign key. The mirror exists for
  // consumers; for everyone else there is nothing to mirror.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", params.userId)
    .maybeSingle();
  if (!profile) {
    return;
  }

  if (!slug) {
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .delete()
      .eq("stripe_subscription_id", params.stripeSubscriptionId);
    if (error) throw error;
    return;
  }

  const { data: priorSub } = await supabaseAdmin
    .from("subscriptions")
    .select("plan, status, billing_cadence, current_period_end")
    .eq("stripe_subscription_id", params.stripeSubscriptionId)
    .maybeSingle();

  const cadence = resolveBillingCadence(params.subscription);

  const prior = priorSub as {
    plan: string;
    status: string;
    billing_cadence?: string | null;
    current_period_end?: string | null;
  } | null;
  const crmChanged =
    !prior ||
    prior.plan !== slug ||
    prior.status !== status ||
    prior.billing_cadence !== cadence;

  // Clear the renewal-reminder timestamp whenever current_period_end
  // advances — that means we entered a new annual period and the next
  // 30-day reminder should fire when this period nears its end.
  const periodAdvanced =
    !!params.currentPeriodEnd &&
    !!prior?.current_period_end &&
    params.currentPeriodEnd > prior.current_period_end;

  const now = new Date().toISOString();
  const upsertPayload: Record<string, unknown> = {
    user_id: params.userId,
    stripe_customer_id: params.stripeCustomerId,
    stripe_subscription_id: params.stripeSubscriptionId,
    plan: slug,
    status,
    billing_cadence: cadence,
    current_period_end: params.currentPeriodEnd,
    updated_at: now,
  };
  if (periodAdvanced) {
    upsertPayload.annual_renewal_reminder_sent_at = null;
  }

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(upsertPayload, { onConflict: "stripe_subscription_id" });

  if (error) throw error;

  if (status === "active" || status === "trialing") {
    void recordFunnelEvent(params.userId, "subscription_active_crm", {
      plan: slug,
      cadence,
      stripe_subscription_id: params.stripeSubscriptionId,
    });
    if (crmChanged) {
      void recordSubscriptionEvent({
        userId: params.userId,
        eventType: SUBSCRIPTION_EVENT_TYPES.CRM_SUBSCRIPTION_ACTIVE,
        plan: slug,
        amount: null,
        stripeSubscriptionId: params.stripeSubscriptionId,
        metadata: { source: "crm_stripe_mirror", cadence },
      });
    }
  }
}

export async function updatePublicSubscriptionStatusByStripeId(
  stripeSubscriptionId: string,
  status: string
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({ status, updated_at: now })
    .eq("stripe_subscription_id", stripeSubscriptionId);
  if (error) throw error;
}
