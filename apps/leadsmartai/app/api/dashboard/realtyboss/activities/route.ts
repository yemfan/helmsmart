import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { listAssistantActivities } from "@/lib/realtyboss/activities";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/realtyboss/activities?limit=
 * Recent AI-team activity rows for the signed-in agent.
 */
export async function GET(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "20");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 20;
    const activities = await listAssistantActivities(agentId, limit);
    return NextResponse.json({ ok: true, activities });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("GET /api/dashboard/realtyboss/activities:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
