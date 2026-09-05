import { NextRequest, NextResponse } from "next/server";
import { getAgentContextFromRequest } from "@/lib/dashboardService";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBossTool } from "@/lib/boss/tools/registry";

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

    // Attribute each step to the teammate who ran it, so the UI can show
    // "Ruby · Marketing Assistant" instead of a generic label. Usually that is
    // the tool's static assignee — but a few tools pick their owner at runtime
    // (hand_off_to_agent routes an escrow question to Grace and a billing one
    // to Emma), and those report it back as `data.owner`.
    const enriched = (steps ?? []).map((s) => {
      const row = s as { tool_name: string; output_json?: { data?: { owner?: unknown } } | null };
      const runtimeOwner = row.output_json?.data?.owner;
      return {
        ...s,
        assignee:
          (typeof runtimeOwner === "string" && runtimeOwner) ||
          getBossTool(row.tool_name)?.assignee ||
          null,
      };
    });

    return NextResponse.json({ ok: true, run, steps: enriched });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
