import { NextResponse } from "next/server";
import {
  hasFeature,
  lowestPlanWithFeature,
  PLAN_FEATURE_LABEL,
  PLANS,
  type BillingCadence,
  type PlanFeature,
  type PlanSlug,
} from "@/lib/billing/plans";
import { pickCurrentSubscription, PAYING_STATUSES, type BillingRow } from "@/lib/billing/currentPlan";
import { tierOf, tierToPlanSlug } from "@/lib/billing/planRank";
import type { LimitReason } from "@/lib/entitlements/types";
import { supabaseAdmin } from "@/lib/supabase/admin";

const PAID_STATUSES = PAYING_STATUSES;

function isBillingCadence(v: unknown): v is BillingCadence {
  return v === "monthly" || v === "annual";
}

/**
 * The user's current **paid** CRM plan, from `billing_subscriptions`.
 *
 * That is now the only source consulted. It previously read
 * `public.subscriptions` first and fell back to `agents.plan_type`,
 * and both halves were broken in the same direction:
 *
 *   - `public.subscriptions` is empty and always has been. Its writer
 *     upserts on a PARTIAL unique index, which Postgres cannot use as
 *     an `ON CONFLICT` target (42P10), so every write since the table
 *     was created has thrown. The fallback was therefore not a
 *     fallback — it was the only path.
 *   - `agents.plan_type` is a three-value cache (`free`/`pro`/`premium`)
 *     whose writer defaults an unrecognised paid subscription to `pro`.
 *     A Signature subscriber gated here gets Pro's features.
 *
 * Returning `null` still means "no plan at all" — a brand-new user
 * mid-onboarding without an `agents` row. An agent with no paid row
 * gets `starter`, which IS the free tier in the v2.0 catalog.
 */
export async function getActiveCrmSubscription(userId: string): Promise<{
  plan: PlanSlug;
  status: string;
  cadence: BillingCadence;
} | null> {
  const { data, error } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("plan, status, livemode, billing_cadence, current_period_start, current_period_end")
    .eq("user_id", userId)
    .in("status", [...PAID_STATUSES])
    .limit(10);

  if (error) throw error;

  const rows = (data as Array<BillingRow & { billing_cadence?: unknown }> | null) ?? [];
  const winner = pickCurrentSubscription(rows);

  if (winner) {
    const tier = tierOf(winner.plan);
    // A `consumer_*` row resolves to `free` — a homeowner product is not an
    // agent entitlement — so fall through to the starter path rather than
    // reporting it as a paid CRM plan.
    if (tier && tier !== "free") {
      const rawCadence = (winner as { billing_cadence?: unknown }).billing_cadence;
      return {
        plan: tierToPlanSlug(tier),
        status: String(winner.status ?? ""),
        cadence: isBillingCadence(rawCadence) ? rawCadence : "monthly",
      };
    }
  }

  // No paid row. Distinguish "an agent on the free tier" from "not an agent
  // yet" — the gates' messaging differs, and `null` drives "you need an
  // account", which is wrong to show someone who has one.
  const { data: agentRow, error: agentErr } = await supabaseAdmin
    .from("agents")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (agentErr) throw agentErr;
  if (!agentRow) return null;

  return { plan: "starter", status: "active", cadence: "monthly" };
}

export async function userHasCrmFeature(userId: string, feature: PlanFeature | string): Promise<boolean> {
  const sub = await getActiveCrmSubscription(userId);
  if (!sub) return false;
  return hasFeature({ plan: sub.plan }, feature);
}

export async function getCrmSubscriptionSnapshot(userId: string): Promise<{
  plan: PlanSlug;
  status: string;
  cadence: BillingCadence;
  features: readonly string[];
  tier: (typeof PLANS)[PlanSlug];
} | null> {
  const sub = await getActiveCrmSubscription(userId);
  if (!sub) return null;
  return {
    plan: sub.plan,
    status: sub.status,
    cadence: sub.cadence,
    features: PLANS[sub.plan].features,
    tier: PLANS[sub.plan],
  };
}

const DEFAULT_LIMIT_REASON: LimitReason = "no_agent_entitlement";

/**
 * What to say when a gate stops someone.
 *
 * "An active subscription is required for this feature" was the answer to every
 * refusal, including the most common one: a paying customer on a plan that
 * simply doesn't carry that feature. A Pro subscriber told they need a
 * subscription has nothing to act on — they have one. Naming the feature, their
 * plan, and the cheapest plan that includes it turns a dead end into a decision.
 */
function entitlementMessage(
  feature: string,
  limitReason: LimitReason,
  currentPlan: PlanSlug | null,
): string {
  if (limitReason === "ai_usage_limit_reached") {
    return "You’ve reached your monthly AI usage on this plan. Upgrade for more.";
  }
  const label = PLAN_FEATURE_LABEL[feature as PlanFeature] ?? "This feature";
  if (!currentPlan) {
    return `${label} needs an active subscription.`;
  }
  const upgrade = lowestPlanWithFeature(feature as PlanFeature);
  const current = PLANS[currentPlan].displayName;
  if (!upgrade || upgrade === currentPlan) {
    // Either nothing sells it, or the plan does carry it and the refusal came
    // from elsewhere — don't invent an upsell we can't stand behind.
    return `${label} isn’t available on your ${current} plan right now.`;
  }
  return `${label} isn’t part of your ${current} plan — ${PLANS[upgrade].displayName} includes it.`;
}

export function subscriptionRequiredResponse(
  feature: string,
  limitReason: LimitReason = DEFAULT_LIMIT_REASON,
  currentPlan: PlanSlug | null = null,
) {
  return NextResponse.json(
    {
      ok: false,
      error: entitlementMessage(feature, limitReason, currentPlan),
      code: "SUBSCRIPTION_REQUIRED",
      feature,
      limitReason,
      currentPlan,
      upgradePlan: lowestPlanWithFeature(feature as PlanFeature),
      billingPath: "/dashboard/billing",
    },
    { status: 402 }
  );
}

/**
 * Absolute URL for mobile / external clients to open the web billing page (hosted checkout + portal).
 */
export function billingPageAbsoluteUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  return base ? `${base}/dashboard/billing` : null;
}
