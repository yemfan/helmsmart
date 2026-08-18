import { NextRequest, NextResponse } from "next/server";
import { getAgentContextFromRequest } from "@/lib/dashboardService";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?limit=10 → the agent's recent Boss runs (dual-auth, same as siblings). */
export async function GET(req: NextRequest) {
  try {
    const { agentId } = await getAgentContextFromRequest(req);
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 10);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 10, 1), 50);
    const { data, error } = await supabaseAdmin
      .from("boss_runs")
      .select(
        "id, trigger, instruction_id, status, objective, plan_json, report, error, tool_calls, max_tool_calls, started_at, finished_at",
      )
      .eq("agent_id", agentId)
      .order("started_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, runs: data ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg, runs: [] }, { status: 500 });
  }
}
