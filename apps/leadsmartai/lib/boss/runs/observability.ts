import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAiUsage } from "@/lib/ai/usage";
import { getAgentEntitlement } from "@/lib/entitlements/getEntitlements";
import { consumeAiToken } from "@/lib/entitlements/consumeAiToken";
import type { BossRunRow } from "./store";

/**
 * Boss v2 production hardening (HANDOFF_BOSS_V2 PR-6): per-run cost into
 * ai_usage, monthly run quotas on the existing ai_actions entitlement rails,
 * and a failure-spike alert into kpi_alert_events.
 */

export async function resolveUserIdForAgent(agentId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("agents")
    .select("auth_user_id")
    .eq("id", agentId)
    .maybeSingle();
  return (data as { auth_user_id?: string | null } | null)?.auth_user_id ?? null;
}

export type RunGate =
  | { allowed: true; userId: string }
  | { allowed: false; code: "no_agent_entitlement" | "ai_usage_limit_reached"; userId: string | null };

/**
 * Monthly agent-run quota: boss runs consume the plan's ai_actions wallet
 * (bonus tokens first, then ai_actions_per_month) — one token per run.
 * Cron-safe: uses the service-role client, not the request-bound one that
 * canUseAiAction() wraps.
 */
export async function gateAndChargeRun(agentId: string): Promise<RunGate> {
  const userId = await resolveUserIdForAgent(agentId);
  if (!userId) return { allowed: false, code: "no_agent_entitlement", userId: null };

  const entitlement = await getAgentEntitlement(supabaseAdmin, userId);
  if (!entitlement) return { allowed: false, code: "no_agent_entitlement", userId };

  const { data: userRow } = await supabaseAdmin
    .from("leadsmart_users")
    .select("bonus_tokens")
    .eq("user_id", userId)
    .maybeSingle();
  const bonus = ((userRow as { bonus_tokens?: number } | null)?.bonus_tokens) ?? 0;

  const limit = (entitlement as { ai_actions_per_month?: number | null }).ai_actions_per_month;
  if (bonus <= 0 && limit != null) {
    const monthStart = new Date().toISOString().slice(0, 7) + "-01";
    const { data } = await supabaseAdmin
      .from("entitlement_ai_usage_monthly")
      .select("ai_actions_used")
      .eq("user_id", userId)
      .eq("month_start", monthStart)
      .maybeSingle();
    const used = (data as { ai_actions_used: number } | null)?.ai_actions_used ?? 0;
    if (used >= limit) return { allowed: false, code: "ai_usage_limit_reached", userId };
  }

  await consumeAiToken(userId);
  return { allowed: true, userId };
}

/** Terminal-status hook: record what the run cost. */
export async function recordRunCost(run: BossRunRow): Promise<void> {
  try {
    const userId = await resolveUserIdForAgent(run.agent_id);
    if (!userId) return;
    await logAiUsage({
      userId,
      tool: `boss_run_${run.trigger}`,
      tokensUsed: run.input_tokens + run.output_tokens,
    });
  } catch (e) {
    console.error("[boss-run] cost logging failed:", e);
  }
}

const FAILURE_RULE_ID = "boss_runs_failed_hourly";
const FAILURE_THRESHOLD = 3;

/** Failed runs in the last hour ≥ threshold → one kpi_alert_events row/hour. */
export async function alertOnFailureSpike(agentId: string): Promise<void> {
  try {
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await supabaseAdmin
      .from("boss_runs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("finished_at", hourAgo);
    if ((count ?? 0) < FAILURE_THRESHOLD) return;

    const { data: existing } = await supabaseAdmin
      .from("kpi_alert_events")
      .select("id")
      .eq("rule_id", FAILURE_RULE_ID)
      .gte("created_at", hourAgo)
      .limit(1)
      .maybeSingle();
    if (existing) return; // one alert per hour is enough

    await supabaseAdmin.from("kpi_alert_events").insert({
      agent_id: agentId,
      rule_id: FAILURE_RULE_ID,
      message: `Boss v2: ${count} runs failed in the last hour — check /api/boss health and recent boss_runs.error values.`,
      observed_value: count,
    });
  } catch (e) {
    console.error("[boss-run] failure alerting failed:", e);
  }
}
