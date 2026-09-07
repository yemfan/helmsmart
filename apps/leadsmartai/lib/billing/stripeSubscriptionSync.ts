import type Stripe from "stripe";
import { mapInternalPlanToCrmSlug } from "@/lib/billing/publicSubscriptionsSync";
import type { InternalPlan } from "@/lib/billing/stripe-plan-map";
import {
  mapStripePriceToPlan,
  resolveInternalPlanFromStripeSubscription,
} from "@/lib/billing/stripe-plan-map";
import { planRowFromCatalog, planSlugToAgentPlan } from "@/lib/entitlements/planCatalog";
import type { AgentPlan } from "@/lib/entitlements/types";
import { PRODUCT_LEADSMART_AGENT } from "@/lib/entitlements/product";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import {
  syncPublicSubscriptionFromStripe,
  updatePublicSubscriptionStatusByStripeId,
} from "@/lib/billing/publicSubscriptionsSync";
import { recordSubscriptionEvent } from "@/lib/analytics/analyticsEvents";
import { SUBSCRIPTION_EVENT_TYPES } from "@/lib/analytics/eventCatalog";

function toIsoOrNull(unixSeconds?: number | null) {
  if (unixSeconds == null || unixSeconds === 0) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

/** `leadsmart_users.role` uses `user` for consumers; `billing_subscriptions.role` uses `consumer`. */
function mapLeadsmartRoleToBillingRole(role: string | null | undefined): string {
  const r = String(role ?? "").toLowerCase().trim();
  if (!r || r === "user") return "consumer";
  return r;
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

async function getProfileByCustomerEmail(email?: string | null) {
  if (!email) return null;

  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .select("user_id, email, full_name, leadsmart_users(role)")
    .eq("email", email)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Stripe `agent_starter` / `agent_pro` price IDs map to Pro / Premium limits in `product_entitlements`.
 */
function billingPlanToAgentPlan(billingPlan: InternalPlan): AgentPlan {
  if (billingPlan === "agent_starter") return "pro";
  if (billingPlan === "agent_pro") return "premium";
  return "starter";
}

/**
 * CloseBoss credit tiers → the legacy entitlement catalog that still meters
 * AI runs and CRM caps. Solo has no catalog row of its own; it is the smallest
 * paid tier, so it takes Pro's caps rather than Starter's.
 */
function crmPlanToAgentPlan(billingPlan: InternalPlan): AgentPlan {
  if (billingPlan === "crm_solo") return "pro";
  return planSlugToAgentPlan(mapInternalPlanToCrmSlug(billingPlan));
}

/**
 * Deactivate prior active rows, then insert a new entitlement row (matches DB partial unique index).
 */
async function syncAgentEntitlement(params: {
  userId: string | null;
  billingPlan: InternalPlan;
  active: boolean;
}) {
  if (!params.userId) return;

  const now0 = new Date().toISOString();

  // CloseBoss plans (crm_*). This function returned early for every one of
  // them, so a CloseBoss subscription never touched product_entitlements:
  //   - on activation the Starter row from signup stayed active, and
  //     reconcileEntitlement — which never overrides an active row — kept a
  //     paying agent on Starter-level AI-run quotas and caps;
  //   - on a lapse the paid row (where one had been backfilled by hand)
  //     stayed active, and reconcile kept the user row "active" forever.
  // Both directions now mirror the legacy SKUs: activation installs the
  // tier's entitlement, a lapse deactivates it and marks the user row
  // inactive so reconcile provisions Starter on the next dashboard load.
  let normalizedPlan: AgentPlan;
  if (String(params.billingPlan).startsWith("crm_")) {
    if (!params.active) {
      const { error: deactErr } = await supabaseAdmin
        .from("product_entitlements")
        .update({ is_active: false, updated_at: now0 })
        .eq("user_id", params.userId)
        .eq("product", PRODUCT_LEADSMART_AGENT);
      if (deactErr) throw deactErr;
      const { error: luErr } = await supabaseAdmin
        .from("leadsmart_users")
        .update({ subscription_status: "inactive", updated_at: now0 } as Record<string, unknown>)
        .eq("user_id", params.userId);
      if (luErr) throw luErr;
      return;
    }
    normalizedPlan = crmPlanToAgentPlan(params.billingPlan);
  } else {
    if (params.billingPlan !== "agent_starter" && params.billingPlan !== "agent_pro") {
      return;
    }
    normalizedPlan = billingPlanToAgentPlan(params.billingPlan);
  }
  const limits = planRowFromCatalog(normalizedPlan);
  const now = new Date().toISOString();

  const { error: deactErr } = await supabaseAdmin
    .from("product_entitlements")
    .update({ is_active: false, updated_at: now })
    .eq("user_id", params.userId)
    .eq("product", PRODUCT_LEADSMART_AGENT);

  if (deactErr) throw deactErr;

  if (!params.active) return;

  const { error: insErr } = await supabaseAdmin.from("product_entitlements").insert({
    user_id: params.userId,
    product: PRODUCT_LEADSMART_AGENT,
    plan: limits.plan,
    is_active: true,
    cma_reports_per_day: limits.cma_reports_per_day,
    max_leads: limits.max_leads,
    max_contacts: limits.max_contacts,
    alerts_level: limits.alerts_level,
    reports_download_level: limits.reports_download_level,
    team_access: limits.team_access,
    source: "stripe",
    starts_at: now,
    updated_at: now,
  });

  if (insErr) throw insErr;
}

/**
 * Close out the user's OTHER rows that still claim to be paying.
 *
 * Every Stripe subscription gets its own row and nothing in the write path ever
 * touched a sibling, so an upgrade — or a checkout that was abandoned and
 * retried — left the previous row `active` forever. `customer.subscription.deleted`
 * would eventually fix it, but only if that one delivery lands; when it doesn't,
 * the row outlives the subscription and the account reads as holding two plans.
 *
 * Every sibling is RE-READ FROM STRIPE rather than inferred. A row whose period
 * has lapsed looks dead but may simply have missed a renewal webhook, and
 * guessing in that direction cancels a paying customer. Stripe is asked, and
 * only its answer is written.
 *
 * Scoped to the same `livemode`: a test-mode subscription is invisible to a live
 * key (and vice versa), so retrieval would 404 and be indistinguishable from a
 * deleted subscription.
 */
async function reconcileSiblingSubscriptions(params: {
  userId: string | null;
  keepSubscriptionId: string;
  livemode: boolean;
}): Promise<void> {
  if (!params.userId) return;

  const { data, error } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("id, provider_subscription_id, status")
    .eq("user_id", params.userId)
    .eq("livemode", params.livemode)
    .in("status", ["active", "trialing"])
    .neq("provider_subscription_id", params.keepSubscriptionId)
    .limit(25);

  if (error) {
    console.warn("[billing] sibling reconcile: could not list rows:", error.message);
    return;
  }

  const siblings =
    (data as Array<{ id: string; provider_subscription_id: string | null; status: string }> | null) ?? [];

  for (const sibling of siblings) {
    if (!sibling.provider_subscription_id) continue;
    try {
      const live = await stripe.subscriptions.retrieve(sibling.provider_subscription_id);
      const trueStatus = mapStripeStatus(live.status);
      if (trueStatus === sibling.status) continue;
      const { error: updErr } = await supabaseAdmin
        .from("billing_subscriptions")
        .update({ status: trueStatus, updated_at: new Date().toISOString() })
        .eq("id", sibling.id);
      if (updErr) throw updErr;
      console.info("[billing] sibling reconciled from Stripe", {
        subscriptionId: sibling.provider_subscription_id,
        was: sibling.status,
        now: trueStatus,
      });
    } catch (e) {
      // A subscription Stripe no longer has is genuinely gone; anything else
      // (network, rate limit) is left alone rather than guessed at.
      const code = (e as { code?: string } | null)?.code;
      if (code === "resource_missing") {
        await supabaseAdmin
          .from("billing_subscriptions")
          .update({ status: "canceled", updated_at: new Date().toISOString() })
          .eq("id", sibling.id);
        continue;
      }
      console.warn(
        "[billing] sibling reconcile skipped:",
        sibling.provider_subscription_id,
        e instanceof Error ? e.message : e,
      );
    }
  }
}

async function resolveCustomerContact(subscription: Stripe.Subscription): Promise<{
  email: string | null;
  name: string | null;
}> {
  const c = subscription.customer;

  if (c && typeof c !== "string") {
    const cust = c as Stripe.Customer;
    return { email: cust.email ?? null, name: cust.name ?? null };
  }

  if (typeof c === "string") {
    const retrieved = await stripe.customers.retrieve(c);
    if ("deleted" in retrieved && retrieved.deleted) {
      return { email: null, name: null };
    }
    const cust = retrieved as Stripe.Customer;
    return {
      email: cust.email ?? null,
      name: cust.name ?? null,
    };
  }

  return { email: null, name: null };
}

export async function syncStripeSubscription(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  const firstItem = subscription.items.data[0];
  const priceId = firstItem?.price?.id ?? null;
  const amountMonthly = firstItem?.price?.unit_amount
    ? firstItem.price.unit_amount / 100
    : 0;

  let { email: customerEmail, name: customerName } = await resolveCustomerContact(subscription);

  if (!customerEmail && subscription.metadata?.email) {
    customerEmail = String(subscription.metadata.email);
  }

  const profile = await getProfileByCustomerEmail(customerEmail);
  const metadataUserId =
    typeof subscription.metadata?.user_id === "string" ? subscription.metadata.user_id : null;
  /** Prefer Stripe metadata from Checkout (authoritative) over email → user_profiles lookup. */
  const lsRow = profile?.leadsmart_users;
  const lsOne = Array.isArray(lsRow) ? lsRow[0] : lsRow;
  const userId = metadataUserId ?? profile?.user_id ?? null;

  const fromPriceOnly = mapStripePriceToPlan(priceId);
  const internalPlan = resolveInternalPlanFromStripeSubscription(priceId, subscription.metadata);
  if (internalPlan !== fromPriceOnly) {
    console.info("[syncStripeSubscription] internal_plan from subscription metadata (price map was different)", {
      subscriptionId: subscription.id,
      priceId,
      fromPriceOnly,
      resolvedPlan: internalPlan,
      metadata: subscription.metadata,
    });
  }

  /** Stripe API returns these on `Subscription`; some TS versions omit them from the type. */
  const subPeriod = subscription as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };
  const periodStart = toIsoOrNull(
    subPeriod.current_period_start ?? firstItem?.current_period_start
  );
  const periodEnd = toIsoOrNull(subPeriod.current_period_end ?? firstItem?.current_period_end);

  const { data: existingRow } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("plan, status, amount_monthly")
    .eq("provider_subscription_id", subscription.id)
    .maybeSingle();

  const prev = existingRow as {
    plan: string;
    status: string;
    amount_monthly: number | string | null;
  } | null;

  const record = {
    user_id: userId,
    email: customerEmail ?? "unknown@example.com",
    full_name: profile?.full_name ?? customerName ?? null,
    role: mapLeadsmartRoleToBillingRole((lsOne as { role?: string } | null)?.role),
    plan: internalPlan,
    status: mapStripeStatus(subscription.status),
    amount_monthly: amountMonthly,
    billing_provider: "stripe",
    provider_customer_id: customerId,
    provider_subscription_id: subscription.id,
    provider_price_id: priceId,
    // Which Stripe ledger this came from. Test-mode webhooks reach the same
    // handler and the same table as live ones, and until this column existed
    // nothing recorded the difference — a sandbox checkout was
    // indistinguishable from a paid one and entitled the account just as much.
    livemode: subscription.livemode,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin.from("billing_subscriptions").upsert(record, {
    onConflict: "provider_subscription_id",
  });

  if (error) throw error;

  await reconcileSiblingSubscriptions({
    userId,
    keepSubscriptionId: subscription.id,
    livemode: subscription.livemode,
  });

  const nextStatus = record.status;
  const nextAmount = Number(record.amount_monthly);
  const prevStatus = prev ? String(prev.status) : null;
  const prevAmount = prev != null ? Number(prev.amount_monthly ?? 0) : null;
  const prevPlan = prev ? String(prev.plan) : null;

  const changed =
    !prev ||
    prevPlan !== record.plan ||
    prevStatus !== nextStatus ||
    prevAmount !== nextAmount;

  if (changed) {
    const wasPaying = prevStatus === "active" || prevStatus === "trialing";
    const becameCanceled = Boolean(wasPaying && nextStatus === "canceled");

    if (becameCanceled) {
      void recordSubscriptionEvent({
        userId,
        eventType: SUBSCRIPTION_EVENT_TYPES.SUBSCRIPTION_CANCELED,
        plan: record.plan,
        amount: 0,
        stripeSubscriptionId: subscription.id,
        metadata: { source: "stripe_sync" },
      });
    } else if (nextStatus === "active" || nextStatus === "trialing") {
      void recordSubscriptionEvent({
        userId,
        eventType: SUBSCRIPTION_EVENT_TYPES.BILLING_UPDATED,
        plan: record.plan,
        amount: nextAmount,
        stripeSubscriptionId: subscription.id,
        metadata: { status: nextStatus },
      });
    } else {
      void recordSubscriptionEvent({
        userId,
        eventType: SUBSCRIPTION_EVENT_TYPES.BILLING_INACTIVE,
        plan: record.plan,
        amount: 0,
        stripeSubscriptionId: subscription.id,
        metadata: { status: nextStatus },
      });
    }
  }

  await syncPublicSubscriptionFromStripe({
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    internalPlan,
    subscription,
    currentPeriodEnd: periodEnd,
  });

  const isActive = subscription.status === "active" || subscription.status === "trialing";

  await syncAgentEntitlement({
    userId,
    billingPlan: internalPlan,
    active: isActive,
  });
}

export async function markSubscriptionCanceled(subscriptionId: string) {
  const { data: subscriptionRow, error: fetchError } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("user_id, plan")
    .eq("provider_subscription_id", subscriptionId)
    .maybeSingle();

  if (fetchError) throw fetchError;

  const { error } = await supabaseAdmin
    .from("billing_subscriptions")
    .update({
      status: "canceled",
      updated_at: new Date().toISOString(),
    })
    .eq("provider_subscription_id", subscriptionId);

  if (error) throw error;

  await updatePublicSubscriptionStatusByStripeId(subscriptionId, "canceled");

  void recordSubscriptionEvent({
    userId: subscriptionRow?.user_id ?? null,
    eventType: SUBSCRIPTION_EVENT_TYPES.SUBSCRIPTION_CANCELED,
    plan: subscriptionRow?.plan ?? null,
    amount: 0,
    stripeSubscriptionId: subscriptionId,
    metadata: { source: "subscription_deleted" },
  });

  if (
    subscriptionRow?.user_id &&
    (subscriptionRow.plan === "agent_starter" ||
      subscriptionRow.plan === "agent_pro" ||
      String(subscriptionRow.plan ?? "").startsWith("crm_"))
  ) {
    await syncAgentEntitlement({
      userId: subscriptionRow.user_id,
      billingPlan: subscriptionRow.plan as InternalPlan,
      active: false,
    });
  }
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const inv = invoice as unknown as {
    subscription?: string | Stripe.Subscription | null;
    parent?: { subscription_details?: { subscription?: string | Stripe.Subscription } | null } | null;
  };
  if (inv.subscription != null) {
    return typeof inv.subscription === "string" ? inv.subscription : inv.subscription.id;
  }
  const nested = inv.parent?.subscription_details?.subscription;
  if (nested != null) {
    return typeof nested === "string" ? nested : nested.id;
  }
  return null;
}

export async function markInvoiceFailed(invoice: Stripe.Invoice) {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return;

  const { error } = await supabaseAdmin
    .from("billing_subscriptions")
    .update({
      status: "past_due",
      updated_at: new Date().toISOString(),
    })
    .eq("provider_subscription_id", subscriptionId);

  if (error) throw error;

  await updatePublicSubscriptionStatusByStripeId(subscriptionId, "past_due");
}

export async function markInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return;

  const { data: subscriptionRow, error: fetchError } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("user_id, plan")
    .eq("provider_subscription_id", subscriptionId)
    .maybeSingle();

  if (fetchError) throw fetchError;

  const { error } = await supabaseAdmin
    .from("billing_subscriptions")
    .update({
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("provider_subscription_id", subscriptionId);

  if (error) throw error;

  await updatePublicSubscriptionStatusByStripeId(subscriptionId, "active");

  if (
    subscriptionRow?.user_id &&
    (subscriptionRow.plan === "agent_starter" ||
      subscriptionRow.plan === "agent_pro" ||
      String(subscriptionRow.plan ?? "").startsWith("crm_"))
  ) {
    await syncAgentEntitlement({
      userId: subscriptionRow.user_id,
      billingPlan: subscriptionRow.plan as InternalPlan,
      active: true,
    });
  }
}
