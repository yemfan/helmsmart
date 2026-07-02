import { NextResponse } from "next/server";
import { getAgentContextFromRequest } from "@/lib/dashboardService";
import {
  listBossRecommendations,
  syncBossRecommendations,
} from "@/lib/realtyboss/recommendations";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/realtyboss/recommendations
 * Syncs recommendations from current CRM signals, then returns the
 * open (new/accepted) set ordered by urgency.
 */
export async function GET(req: Request) {
  try {
    const { agentId } = await getAgentContextFromRequest(req);
    await syncBossRecommendations(agentId);
    const recommendations = await listBossRecommendations(agentId, 5);
    return NextResponse.json({ ok: true, recommendations });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("GET /api/dashboard/realtyboss/recommendations:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
