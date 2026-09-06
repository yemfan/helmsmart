import { NextResponse } from "next/server";
import { getAgentContextFromRequest } from "@/lib/dashboardService";
import {
  listBossRecommendations,
  syncBossRecommendations,
} from "@/lib/closeboss/recommendations";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { goalKey } from "@/lib/closeboss/goal";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/closeboss/recommendations
 * Syncs recommendations from current CRM signals, then returns the
 * open (new/accepted) set ordered by urgency.
 */
export async function GET(req: Request) {
  try {
    const { agentId } = await getAgentContextFromRequest(req);
    const [, { data: agentRow }] = await Promise.all([
      syncBossRecommendations(agentId),
      supabaseAdmin.from("agents").select("onboarding").eq("id", agentId).maybeSingle(),
    ]);
    const goal = goalKey((agentRow as { onboarding?: { goal?: unknown } | null } | null)?.onboarding?.goal);
    const recommendations = await listBossRecommendations(agentId, 5, goal);
    return NextResponse.json({ ok: true, recommendations });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("GET /api/dashboard/closeboss/recommendations:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
