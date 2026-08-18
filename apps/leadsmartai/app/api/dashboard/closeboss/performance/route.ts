import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AI_TEAM, type AssistantType } from "@/lib/closeboss/team";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;
const SERIES_DAYS = 14;

type AssistantPerf = {
  type: AssistantType;
  /** Activities in the 30-day window. */
  activities: number;
  /** Of those, how many flagged for human attention. */
  needsAttention: number;
  /** Activities per day, oldest → newest, for the last 14 days. */
  series: number[];
};

/**
 * GET /api/dashboard/closeboss/performance
 * 30-day AI-team performance from real logs: assistant_activities,
 * call_logs, and boss_recommendations. No projections, no placeholders —
 * every number is a row count.
 */
export async function GET() {
  try {
    const { agentId } = await getCurrentAgentContext();
    const since = new Date(Date.now() - WINDOW_DAYS * DAY_MS).toISOString();
    const seriesStartMs = startOfDayMs(Date.now()) - (SERIES_DAYS - 1) * DAY_MS;

    const [activitiesRes, callsRes, recsRes] = await Promise.all([
      supabaseAdmin
        .from("assistant_activities")
        .select("assistant_type, requires_attention, created_at")
        .eq("agent_id", agentId)
        .gte("created_at", since)
        .limit(2000),
      supabaseAdmin
        .from("call_logs")
        .select("direction, status, duration_seconds, textback_message_log_id, created_at")
        .eq("agent_id", agentId)
        .gte("created_at", since)
        .limit(2000),
      supabaseAdmin
        .from("boss_recommendations")
        .select("status, updated_at, created_at")
        .eq("agent_id", agentId)
        .gte("created_at", since)
        .limit(2000),
    ]);
    if (activitiesRes.error) throw new Error(activitiesRes.error.message);
    if (callsRes.error) throw new Error(callsRes.error.message);
    if (recsRes.error) throw new Error(recsRes.error.message);

    const activities = (activitiesRes.data ?? []) as {
      assistant_type: AssistantType;
      requires_attention: boolean;
      created_at: string;
    }[];

    const assistants: AssistantPerf[] = AI_TEAM.map((def) => {
      const mine = activities.filter((a) => a.assistant_type === def.type);
      const series = new Array(SERIES_DAYS).fill(0) as number[];
      for (const a of mine) {
        const idx = Math.floor((startOfDayMs(new Date(a.created_at).getTime()) - seriesStartMs) / DAY_MS);
        if (idx >= 0 && idx < SERIES_DAYS) series[idx] += 1;
      }
      return {
        type: def.type,
        activities: mine.length,
        needsAttention: mine.filter((a) => a.requires_attention).length,
        series,
      };
    });

    const calls = (callsRes.data ?? []) as {
      direction: string;
      status: string;
      duration_seconds: number | null;
      textback_message_log_id: string | null;
    }[];
    const inbound = calls.filter((c) => c.direction === "inbound");
    const answered = inbound.filter((c) => c.status === "completed");
    const missed = inbound.filter((c) => c.status !== "completed");
    const durations = answered
      .map((c) => c.duration_seconds)
      .filter((d): d is number => typeof d === "number" && d > 0);

    const recs = (recsRes.data ?? []) as { status: string }[];

    return NextResponse.json({
      ok: true,
      windowDays: WINDOW_DAYS,
      seriesDays: SERIES_DAYS,
      assistants,
      calls: {
        answered: answered.length,
        missed: missed.length,
        recovered: missed.filter((c) => c.textback_message_log_id != null).length,
        outbound: calls.filter((c) => c.direction === "outbound").length,
        avgDurationSeconds: durations.length
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : null,
      },
      recommendations: {
        open: recs.filter((r) => r.status === "new" || r.status === "accepted").length,
        completed: recs.filter((r) => r.status === "completed").length,
        dismissed: recs.filter((r) => r.status === "dismissed").length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("GET /api/dashboard/closeboss/performance:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function startOfDayMs(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
