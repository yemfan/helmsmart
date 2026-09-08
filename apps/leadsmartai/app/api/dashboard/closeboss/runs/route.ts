import { NextRequest, NextResponse } from "next/server";
import { getAgentContextFromRequest } from "@/lib/dashboardService";
import { listRecentRuns } from "@/lib/closeboss/conversation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?limit=10 → the agent's recent Boss runs (dual-auth, same as siblings). */
export async function GET(req: NextRequest) {
  try {
    const { agentId } = await getAgentContextFromRequest(req);
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 10);
    const runs = await listRecentRuns(agentId, Number.isFinite(limitRaw) ? limitRaw : 10);
    return NextResponse.json({ ok: true, runs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg, runs: [] }, { status: 500 });
  }
}
