import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { plansDisagree, resolvePlanTier, type PlanTier } from "./planRank";

/**
 * Read every place a plan is recorded and return the highest.
 *
 * See planRank.ts for why this is necessary rather than reading one column.
 * Short version: four fields, three answers, and picking the wrong one tells
 * a paying Signature customer to upgrade.
 *
 * One round trip per source, run together. Cheap enough for a gate, and the
 * alternative — trusting a single denormalised column — is what produces the
 * bug this exists to avoid.
 */

export type AgentPlan = {
  tier: PlanTier;
  /** True when the sources disagreed. Logged, because nothing else reports it. */
  drifted: boolean;
  /** What each source said, for the log line and for support. */
  sources: Record<string, string | null>;
};

export async function resolveAgentPlan(agentId: string | number): Promise<AgentPlan> {
  const fallback: AgentPlan = { tier: "free", drifted: false, sources: {} };

  try {
    const { data: agentRow } = await supabaseAdmin
      .from("agents")
      .select("plan_type, subscription_plan, auth_user_id")
      .eq("id", agentId as never)
      .maybeSingle();

    const agent = (agentRow ?? {}) as {
      plan_type?: string | null;
      subscription_plan?: string | null;
      auth_user_id?: string | null;
    };

    const authUserId = agent.auth_user_id ?? null;

    const [userRow, subRow] = await Promise.all([
      authUserId
        ? supabaseAdmin
            .from("leadsmart_users")
            .select("plan")
            .eq("user_id", authUserId as never)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      authUserId
        ? supabaseAdmin
            .from("billing_subscriptions")
            .select("plan")
            .eq("user_id", authUserId as never)
            .eq("status", "active")
            // A user can hold more than one active row — agent 26 has both
            // crm_signature and consumer_free. Take them all and let the rank
            // decide; consumer_* maps to free, so it cannot mask the real one.
            .limit(10)
        : Promise.resolve({ data: null }),
    ]);

    const userPlan = (userRow.data as { plan?: string | null } | null)?.plan ?? null;
    const subPlans = ((subRow.data as Array<{ plan?: string | null }> | null) ?? []).map(
      (r) => r.plan ?? null,
    );

    const sources: Record<string, string | null> = {
      "agents.plan_type": agent.plan_type ?? null,
      "agents.subscription_plan": agent.subscription_plan ?? null,
      "leadsmart_users.plan": userPlan,
      "billing_subscriptions.plan": subPlans.join(",") || null,
    };

    const candidates = [
      agent.plan_type,
      agent.subscription_plan,
      userPlan,
      ...subPlans,
    ];

    const drifted = plansDisagree(candidates);
    if (drifted) {
      // Every occurrence is a billing record that needs reconciling, and no
      // other code path notices. Warn rather than fail: the customer gets the
      // tier they paid for regardless.
      console.warn(
        `[plan] sources disagree for agent ${agentId}:`,
        JSON.stringify(sources),
      );
    }

    return { tier: resolvePlanTier(candidates), drifted, sources };
  } catch (e) {
    console.warn("[plan] resolveAgentPlan failed:", e instanceof Error ? e.message : e);
    return fallback;
  }
}
