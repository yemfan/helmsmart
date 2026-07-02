import { NextRequest, NextResponse } from "next/server";
import { getAgentContextFromRequest } from "@/lib/dashboardService";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → one run + its step timeline (dual-auth). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { agentId } = await getAgentContextFromRequest(req);
    const { id } = await ctx.params;
    const { data: run, error } = await supabaseAdmin
      .from("boss_runs")
      .select(
        "id, trigger, instruction_id, status, objective, plan_json, report, error, tool_calls, max_tool_calls, input_tokens, output_tokens, token_budget, started_at, finished_at",
      )
      .eq("id", id)
      .eq("agent_id", agentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!run) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const { data: steps } = await supabaseAdmin
      .from("boss_run_steps")
      .select(
        "step_index, tool_name, risk_class, input_json, output_json, status, approval_state, error, created_at, finished_at",
      )
      .eq("run_id", id)
      .order("step_index", { ascending: true });

    return NextResponse.json({ ok: true, run, steps: steps ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
