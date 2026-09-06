import "server-only";

import { getCurrentPlan, type CurrentPlan } from "@/lib/credits/currentPlan";

/**
 * Plan lookup for chrome that renders on EVERY dashboard navigation (the
 * Upgrade pill, the sidebar promo). `getCurrentPlan` asks Stripe, which is
 * right for the billing page and wrong for a top bar — so this memoises per
 * user for a few minutes in instance memory. Fluid Compute keeps instances
 * warm, so the hit rate is real; a cold instance just pays one Stripe call.
 *
 * Fails open to "free": a Stripe hiccup should never hide the credits UI, and
 * showing an upsell to a paying user for five minutes is the cheaper mistake.
 */
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; plan: CurrentPlan }>();

export async function getCurrentPlanCached(userId: string): Promise<CurrentPlan | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.plan;
  try {
    const plan = await getCurrentPlan(userId);
    cache.set(userId, { at: Date.now(), plan });
    return plan;
  } catch {
    return null;
  }
}

/** True when the account has a live subscription — i.e. it should not be sold one. */
export async function isPaidPlanCached(userId: string): Promise<boolean> {
  const plan = await getCurrentPlanCached(userId);
  return Boolean(plan?.planId);
}
