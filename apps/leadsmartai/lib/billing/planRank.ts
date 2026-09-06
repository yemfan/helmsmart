/**
 * Ranking over the ONE plan vocabulary: `InternalPlan`, as recorded on
 * `billing_subscriptions.plan`.
 *
 * That table is the source of truth because it is the only one written from
 * Stripe with the provider ids, amounts and periods attached — it is the money.
 * `agents.plan_type` and `leadsmart_users.plan` are legacy three-value caches
 * (`free`/`pro`/`premium`) that no longer decide anything, and
 * `agents.subscription_plan` is a fossil no code has written in a year. See
 * `currentPlan.ts` for how a user's single authoritative row is chosen, and
 * `supabase/migrations/20260829000000_billing_single_source_of_truth.sql` for
 * the reconciliation.
 *
 * Ranking is still needed, and not as a workaround: a user can legitimately
 * hold more than one active row (an agent SKU alongside a homeowner product),
 * so something has to say which one is their agent entitlement.
 *
 * Pure — no I/O — so the precedence is testable without a database.
 */

import { PLANS, type PlanSlug } from "./plans";
import type { InternalPlan } from "./stripe-plan-map";

/** Ordered worst to best. Position IS the rank. */
export const PLAN_RANK = [
  "free",
  "starter",
  "pro",
  "premium",
  "signature",
  "team",
] as const;

export type PlanTier = (typeof PLAN_RANK)[number];

/**
 * `InternalPlan` → tier.
 *
 * The `crm_*` half is DERIVED from the plan catalog rather than restated, so a
 * renamed or added tier cannot drift between the two files. The rest are SKUs
 * that only exist on historical rows.
 */
const ALIASES: Record<string, PlanTier> = {
  // crm_starter → starter, crm_pro → pro, … straight off the catalog.
  ...Object.fromEntries(
    (Object.keys(PLANS) as PlanSlug[]).map((slug) => [PLANS[slug].internalPlan, slug]),
  ),
  // Retired agent SKUs. These bridge onto CRM tiers exactly as
  // `mapInternalPlanToCrmSlug` does — `agent_starter` was the $49 product and
  // `agent_pro` the $99 one, so they are Pro and Premium, NOT Starter and Pro.
  // Getting this wrong under-grants a legacy subscriber by a full tier.
  agent_starter: "pro",
  agent_pro: "premium",
  // Homeowner products. NOT an agent entitlement — an agent who also holds one
  // has not thereby bought an agent tier.
  consumer_free: "free",
  consumer_premium: "free",
} as Record<string, PlanTier>;

/** Normalise one `billing_subscriptions.plan` value to a tier, or null when it says nothing. */
export function tierOf(raw: string | null | undefined): PlanTier | null {
  const key = String(raw ?? "").trim().toLowerCase();
  if (!key) return null;
  return ALIASES[key] ?? null;
}

export function rankOf(tier: PlanTier): number {
  return PLAN_RANK.indexOf(tier);
}

/**
 * The highest tier among some plan values.
 *
 * @param candidates raw `plan` values, in any order. Unknown and empty values
 *   are ignored rather than treated as free — an unrecognised spelling means
 *   "this row says nothing", not "this person pays nothing".
 */
export function resolvePlanTier(candidates: Array<string | null | undefined>): PlanTier {
  let best: PlanTier = "free";
  for (const candidate of candidates) {
    const tier = tierOf(candidate);
    if (tier && rankOf(tier) > rankOf(best)) best = tier;
  }
  return best;
}

/** Does this tier reach the one a feature requires? */
export function meetsPlan(tier: PlanTier, required: PlanTier): boolean {
  return rankOf(tier) >= rankOf(required);
}

/**
 * Tier → the catalog slug the feature gates in `plans.ts` are keyed by.
 *
 * `free` and `starter` are the same product: Starter IS the free tier under the
 * v2.0 catalog (`PLANS.starter.price === 0`). The rank keeps them separate only
 * so "no row at all" and "an explicit free row" stay distinguishable upstream.
 */
export function tierToPlanSlug(tier: PlanTier): PlanSlug {
  return tier === "free" ? "starter" : tier;
}
