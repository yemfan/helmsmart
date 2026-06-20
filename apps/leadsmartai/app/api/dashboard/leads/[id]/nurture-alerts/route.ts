import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getCurrentAgentContext } from "@/lib/dashboardService";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await ctx.params;
    // Authenticates (throws if no session) and resolves the agent.
    const { agentId } = await getCurrentAgentContext();

    // contacts + nurture_alerts have RLS enabled with no policy, so the
    // session client is deny-all. Read via the service-role client with an
    // explicit agent_id filter as the tenant boundary (same pattern as
    // getContacts / the leads route).
    const { data: leadRow } = await supabaseServer
      .from("contacts")
      .select("id")
      .eq("id", leadId)
      .eq("agent_id", agentId)
      .maybeSingle();

    if (!leadRow) {
      // Lead doesn't belong to this agent (or doesn't exist) — no alerts.
      return NextResponse.json({ ok: true, alerts: [] });
    }

    const { data, error } = await supabaseServer
      .from("nurture_alerts")
      .select("id,type,message,created_at")
      .eq("contact_id", leadId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;

    return NextResponse.json({ ok: true, alerts: data ?? [] });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    const status = message === "Not authenticated" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
