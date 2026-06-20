import { NextResponse } from "next/server";
import { requireCrmFeature } from "@/lib/billing/guard";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAgentScopeForAgent } from "@/lib/teams/scope.server";

export const runtime = "nodejs";

/**
 * Cancel a still-pending scheduled outreach action. Soft cancel (status →
 * cancelled) so it stays visible in the "recent" list; only rows still
 * 'scheduled' can be cancelled (a row the cron already claimed/sent can't).
 * Agent-scoped via the service-role client.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireCrmFeature("basic_crm");
    if (!gate.ok) return gate.response;
    const scope = await getAgentScopeForAgent(String(gate.ctx.agentId));
    const { id } = await params;

    const { data, error } = await supabaseServer
      .from("scheduled_actions")
      .update({ status: "cancelled" } as Record<string, unknown>)
      .eq("id", id)
      .eq("status", "scheduled")
      .in("agent_id", scope.agentIds)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Couldn't cancel — it may have already sent." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not cancel the action.";
    console.error("outreach/scheduled DELETE", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
