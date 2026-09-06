import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { startBossRun, continueBossRun } from "./service";
import { safeAccountTimezone } from "@/lib/agent/timezone";

/**
 * Proactive overnight mode (HANDOFF_BOSS_V2 PR-5).
 *
 * An every-15-min cron calls runOvernightForDueAgents(); each opted-in agent whose
 * LOCAL clock is in the 4am window (same per-agent-timezone pattern as the
 * daily-briefing cron) gets one autonomous boss_run with stricter caps:
 * 15 tool calls, zero voice calls, all outbound parked as drafts.
 */

export const OVERNIGHT_MAX_TOOLS = 15;
const OVERNIGHT_TARGET = "04:00";

export function buildOvernightObjective(): string {
  return [
    "Overnight review. While the realtor sleeps, work through their business and prepare their morning:",
    "1. query_crm pipeline_summary and stale_hot_leads — find hot leads that have gone quiet.",
    "2. query_crm upcoming_deadlines — transactions closing soon or with contingency deadlines.",
    "3. query_crm overdue_tasks — anything slipping.",
    "4. For up to 3 stale hot leads: draft_message a re-engagement text or email (never send — drafts only).",
    "5. For an urgent transaction deadline: create_task for the realtor with the right due time.",
    "6. If a market check would help a specific lead conversation, get_market_snapshot for their city.",
    "",
    "Hard rules tonight: no voice calls; outbound will be parked for approval automatically — that is expected and correct. Stay within budget; prefer the highest-impact items.",
    "",
    "Finish with the morning brief in exactly this shape:",
    "DONE: <research/tasks completed, with links>",
    "DRAFTED — APPROVE: <each drafted message: who, channel, one-line gist>",
    "NEEDS YOU: <decisions or blockers only the realtor can handle, most urgent first>",
  ].join("\n");
}

type DueAgent = { agentId: string };

/** Agents opted in whose local time is within 15 min of 4am and who haven't
 *  had an overnight run in the last 20 hours. */
async function findDueAgents(now: Date): Promise<DueAgent[]> {
  const { data: optedIn } = await supabaseAdmin
    .from("agent_ai_settings")
    .select("agent_id")
    .eq("overnight_mode", true);
  const ids = ((optedIn ?? []) as { agent_id: number | string }[]).map((r) => String(r.agent_id));
  if (ids.length === 0) return [];

  const { data: agents } = await supabaseAdmin
    .from("agents")
    .select("id, timezone")
    .in("id", ids);
  const rows = (agents ?? []) as { id: number | string; timezone: string | null }[];

  const due: DueAgent[] = [];
  for (const a of rows) {
    // safeAccountTimezone, not `|| "America/Los_Angeles"`: the default lives in
    // one place, and a junk value ("EST" resolves to a zone with no DST) has to
    // be rejected rather than passed to Intl.
    const tz = safeAccountTimezone(a.timezone);
    if (!withinFifteen(currentLocalHHMM(now, tz), OVERNIGHT_TARGET)) continue;
    const { data: recent } = await supabaseAdmin
      .from("boss_runs")
      .select("id")
      .eq("agent_id", a.id)
      .eq("trigger", "overnight")
      .gte("started_at", new Date(now.getTime() - 20 * 3600_000).toISOString())
      .limit(1)
      .maybeSingle();
    if (recent) continue;
    due.push({ agentId: String(a.id) });
  }
  return due;
}

export async function runOvernightForDueAgents(
  now: Date = new Date(),
): Promise<{ started: number; agents: string[] }> {
  const due = await findDueAgents(now);
  const started: string[] = [];
  for (const { agentId } of due) {
    const res = await startBossRun({
      agentId,
      objective: buildOvernightObjective(),
      trigger: "overnight",
      maxToolCalls: OVERNIGHT_MAX_TOOLS,
    });
    if ("runId" in res) {
      started.push(agentId);
      try {
        await continueBossRun(res.runId);
      } catch (e) {
        console.error(`[boss-overnight] run failed for agent ${agentId}:`, e);
      }
    }
  }
  return { started: started.length, agents: started };
}

// Same helpers as the daily-briefing cron (kept local: that route doesn't
// export them, and the logic is 10 lines of Intl).
function currentLocalHHMM(now: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
  }
}

function withinFifteen(localHHMM: string, target: string): boolean {
  const [h, m] = localHHMM.split(":").map(Number);
  const [th, tm] = target.split(":").map(Number);
  const mins = h * 60 + m;
  const tmins = th * 60 + tm;
  return mins >= tmins && mins < tmins + 15;
}

/**
 * Additive Top Priorities from an overnight run: one recommendation per step
 * parked for approval. Deterministic CRM signals stay the floor; these ride on
 * top with a stable dedupe key so a dismissed card never resurrects.
 */
export async function syncOvernightRecommendations(run: {
  id: string;
  agent_id: string;
}): Promise<void> {
  const { data: steps } = await supabaseAdmin
    .from("boss_run_steps")
    .select("step_index, tool_name, output_json")
    .eq("run_id", run.id)
    .eq("approval_state", "pending");
  for (const s of (steps ?? []) as {
    step_index: number;
    tool_name: string;
    output_json: { summary?: string } | null;
  }[]) {
    await supabaseAdmin.from("boss_recommendations").upsert(
      {
        agent_id: run.agent_id,
        recommendation_type: "overnight_approval",
        title: `Approve: ${(s.output_json?.summary ?? s.tool_name).slice(0, 180)}`,
        summary: "Prepared by your overnight run — review and approve to send.",
        reason: "overnight_run",
        priority: 15,
        related_entity_type: "boss_run",
        related_entity_id: run.id,
        recommended_action: "Review & approve",
        action_href: "/dashboard/boss",
        dedupe_key: `overnight:${run.id}:${s.step_index}`,
        status: "new",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "agent_id,dedupe_key", ignoreDuplicates: true },
    );
  }
}
