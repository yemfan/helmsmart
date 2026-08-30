/**
 * Which plan is an agent actually on?
 *
 * There is no single answer in the database, which is the problem this module
 * exists to contain. For agent 26 — the only paying account — four fields give
 * three answers:
 *
 *   agents.plan_type              pro
 *   agents.subscription_plan      premium
 *   leadsmart_users.plan          premium
 *   billing_subscriptions.plan    crm_signature   (and consumer_free, both
 *                                                  marked active)
 *
 * Every one of those was written by a different generation of the billing
 * code and none was retired. Gating a paid feature on whichever field is
 * nearest to hand is how a Signature customer gets told they need to upgrade —
 * and the customer, not the code, is the one who notices.
 *
 * THE RULE: rank them, take the highest. Two reasons, and the second is the
 * important one:
 *
 *   1. Stripe is the money, so an active subscription row outranks the
 *      denormalised copies that may simply be stale.
 *   2. When the sources disagree the person has, somewhere, paid for the
 *      higher one. Granting the better tier costs a feature; denying it costs
 *      a customer. Those are not symmetrical, and the asymmetry decides.
 *
 * Pure — no I/O — so the precedence can be tested without a database. The
 * server-side reader lives in resolveAgentPlan.ts.
 *
 * This is a workaround, not a design. The drift itself needs reconciling; a
 * single source of truth would delete this file.
 */

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
 * Every spelling any of the four sources has ever used, mapped to one tier.
 *
 * `consumer_*` are the homeowner-side products, not agent tiers — an agent who
 * also holds one must not be credited with an agent plan for it. They map to
 * free deliberately.
 */
const ALIASES: Record<string, PlanTier> = {
  // agents.plan_type / agents.subscription_plan / leadsmart_users.plan
  free: "free",
  starter: "starter",
  pro: "pro",
  premium: "premium",
  signature: "signature",
  team: "team",
  // billing_subscriptions.plan — the InternalPlan vocabulary
  crm_starter: "starter",
  crm_pro: "pro",
  crm_premium: "premium",
  crm_signature: "signature",
  crm_team: "team",
  agent_starter: "starter",
  agent_pro: "pro",
  loan_broker_pro: "pro",
  // Homeowner products. NOT an agent entitlement.
  consumer_free: "free",
  consumer_premium: "free",
};

/** Normalise one field's value to a tier, or null when it says nothing. */
export function tierOf(raw: string | null | undefined): PlanTier | null {
  const key = String(raw ?? "").trim().toLowerCase();
  if (!key) return null;
  return ALIASES[key] ?? null;
}

export function rankOf(tier: PlanTier): number {
  return PLAN_RANK.indexOf(tier);
}

/**
 * The highest tier any source claims.
 *
 * @param candidates raw values from the plan fields, in any order. Unknown and
 *   empty values are ignored rather than treated as free — an unrecognised
 *   spelling means "this source does not know", not "this person pays
 *   nothing".
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
 * True when the sources disagree — worth logging, because every occurrence is
 * a billing record that needs reconciling and nothing else will report it.
 */
export function plansDisagree(candidates: Array<string | null | undefined>): boolean {
  const tiers = candidates
    .map(tierOf)
    .filter((t): t is PlanTier => t !== null);
  return new Set(tiers).size > 1;
}
