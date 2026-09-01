import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { pickCurrentSubscription, type BillingRow } from "./currentPlan";
import { tierOf, type PlanTier } from "./planRank";

/**
 * An agent's plan, read from the one place that records it.
 *
 * This used to read four columns and take the highest, because the four
 * disagreed and no one knew which to trust. They no longer disagree:
 * `billing_subscriptions` is canonical, `agents.plan_type` and
 * `leadsmart_users.plan` are caches derived from it, and
 * `agents.subscription_plan` is gone. See `planRank.ts`.
 *
 * Ranking still happens, but over rows rather than over columns — `currentPlan.ts`
 * explains why a user can legitimately have more than one.
 */

export type AgentPlan = {
  tier: PlanTier;
  /** The Stripe subscription behind the tier, for support and the billing UI. */
  subscriptionId: string | null;
  /** The canonical `plan` value on the winning row. Null when there is none. */
  internalPlan: string | null;
};

const FREE: AgentPlan = { tier: "free", subscriptionId: null, internalPlan: null };

export async function resolveAgentPlan(agentId: string | number): Promise<AgentPlan> {
  try {
    const { data: agentRow } = await supabaseAdmin
      .from("agents")
      .select("auth_user_id")
      .eq("id", agentId as never)
      .maybeSingle();

    const authUserId = (agentRow as { auth_user_id?: string | null } | null)?.auth_user_id ?? null;
    if (!authUserId) return FREE;

    return await resolvePlanForUser(authUserId);
  } catch (e) {
    console.warn("[plan] resolveAgentPlan failed:", e instanceof Error ? e.message : e);
    return FREE;
  }
}

/**
 * Same read, keyed by auth user id.
 *
 * `limit(10)` rather than `maybeSingle()`: more than one row is expected — see
 * `currentPlan.ts` — and `maybeSingle()` would turn that into an error instead
 * of a decision.
 */
export async function resolvePlanForUser(authUserId: string): Promise<AgentPlan> {
  try {
    const { data } = await supabaseAdmin
      .from("billing_subscriptions")
      .select("plan, status, livemode, current_period_start, current_period_end, provider_subscription_id")
      .eq("user_id", authUserId as never)
      .in("status", ["active", "trialing"])
      .limit(10);

    const rows = (data as Array<BillingRow & { provider_subscription_id?: string | null }> | null) ?? [];
    const winner = pickCurrentSubscription(rows);
    if (!winner) return FREE;

    return {
      tier: tierOf(winner.plan) ?? "free",
      subscriptionId:
        (winner as { provider_subscription_id?: string | null }).provider_subscription_id ?? null,
      internalPlan: winner.plan ?? null,
    };
  } catch (e) {
    console.warn("[plan] resolvePlanForUser failed:", e instanceof Error ? e.message : e);
    return FREE;
  }
}
