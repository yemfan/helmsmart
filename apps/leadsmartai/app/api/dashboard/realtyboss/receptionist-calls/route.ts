import { NextRequest, NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { listReceptionistCalls } from "@/lib/realtyboss/receptionistCalls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/realtyboss/receptionist-calls?limit=100
 * The Receptionist console call list — every call with the actions
 * the AI took (contact / appointment / task / text-back / call-back).
 */
export async function GET(req: NextRequest) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 100);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 100, 1), 200);
    const calls = await listReceptionistCalls(agentId, limit);
    return NextResponse.json({ ok: true, calls });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ ok: false, error: message, calls: [] }, { status: 500 });
  }
}
