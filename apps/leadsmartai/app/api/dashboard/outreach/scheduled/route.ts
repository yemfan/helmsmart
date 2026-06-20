import { NextResponse } from "next/server";
import { requireCrmFeature } from "@/lib/billing/guard";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAgentScopeForAgent } from "@/lib/teams/scope.server";

export const runtime = "nodejs";

type Row = {
  id: string;
  channel: string;
  purpose: string;
  contact_ids: string[] | null;
  subject: string | null;
  scheduled_for: string;
  status: string;
  sent_at: string | null;
  result: { sent?: number; failed?: number; total?: number } | null;
};

/**
 * Recent + upcoming scheduled outreach actions for the agent — backs the
 * "Scheduled & recent actions" strip on the Sales Assistant page. Service-role
 * + agent-scope (same tenant-boundary pattern as the rest of the dashboard).
 */
export async function GET() {
  try {
    const gate = await requireCrmFeature("basic_crm");
    if (!gate.ok) return gate.response;
    const scope = await getAgentScopeForAgent(String(gate.ctx.agentId));

    const { data, error } = await supabaseServer
      .from("scheduled_actions")
      .select("id,channel,purpose,contact_ids,subject,scheduled_for,status,sent_at,result")
      .in("agent_id", scope.agentIds)
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw error;

    const actions = ((data ?? []) as Row[]).map((r) => ({
      id: String(r.id),
      channel: r.channel,
      purpose: r.purpose,
      count: Array.isArray(r.contact_ids) ? r.contact_ids.length : 0,
      subject: r.subject ?? null,
      scheduledFor: r.scheduled_for,
      status: r.status,
      sentAt: r.sent_at ?? null,
      result: r.result ?? null,
    }));
    return NextResponse.json({ ok: true, actions });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load scheduled actions.";
    console.error("outreach/scheduled", e);
    return NextResponse.json({ ok: false, error: msg, actions: [] });
  }
}
