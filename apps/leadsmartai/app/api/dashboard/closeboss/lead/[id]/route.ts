import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/closeboss/lead/[id]
 *
 * Everything the lead-profile drawer needs to present a PERSON, not a
 * record (theme constitution): profile, the AI team's work with them,
 * conversations, appointments, open tasks, and the next best action.
 * One round-trip; all reads scoped to the signed-in agent.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;
    // ?full=1 → the full profile page; the drawer uses the lean limits.
    const full = new URL(req.url).searchParams.get("full") === "1";
    const lim = {
      tasks: full ? 8 : 5,
      events: full ? 5 : 3,
      calls: full ? 10 : 5,
      sms: full ? 14 : 6,
      activities: full ? 20 : 8,
    };

    const { data: contact, error: contactErr } = await supabaseAdmin
      .from("contacts")
      .select(
        "id,name,first_name,email,phone,source,rating,engagement_score,intent,buying_or_selling,timeline,search_location,price_min,price_max,property_address,notes,last_activity_at,created_at,lifecycle_stage,auto_pilot",
      )
      .eq("id", id)
      .eq("agent_id", agentId)
      .maybeSingle();
    if (contactErr) throw new Error(contactErr.message);
    if (!contact) {
      return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
    }

    const [tasksRes, eventsRes, callsRes, smsRes, actsRes, recRes] = await Promise.all([
      supabaseAdmin
        .from("crm_tasks")
        .select("id,title,due_at,priority,status")
        .eq("agent_id", agentId)
        .eq("contact_id", id)
        .eq("status", "open")
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(lim.tasks),
      supabaseAdmin
        .from("lead_calendar_events")
        .select("id,title,starts_at,status")
        .eq("agent_id", agentId)
        .eq("contact_id", id)
        .gte("starts_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("starts_at", { ascending: true })
        .limit(lim.events),
      supabaseAdmin
        .from("call_logs")
        .select("id,direction,status,duration_seconds,notes,created_at")
        .eq("agent_id", agentId)
        .eq("contact_id", id)
        .order("created_at", { ascending: false })
        .limit(lim.calls),
      supabaseAdmin
        .from("sms_messages")
        .select("id,direction,message,created_at,assistant_type")
        .eq("contact_id", id)
        .order("created_at", { ascending: false })
        .limit(lim.sms),
      supabaseAdmin
        .from("assistant_activities")
        .select("id,assistant_type,summary,outcome,requires_attention,created_at")
        .eq("agent_id", agentId)
        .eq("related_entity_id", id)
        .order("created_at", { ascending: false })
        .limit(lim.activities),
      supabaseAdmin
        .from("boss_recommendations")
        .select("id,title,reason,recommended_action,action_href,expected_outcome,status")
        .eq("agent_id", agentId)
        .eq("related_entity_id", id)
        .in("status", ["new", "accepted"])
        .order("priority", { ascending: true })
        .limit(1),
    ]);

    return NextResponse.json({
      ok: true,
      person: contact,
      tasks: tasksRes.data ?? [],
      appointments: eventsRes.data ?? [],
      calls: callsRes.data ?? [],
      messages: smsRes.data ?? [],
      activities: actsRes.data ?? [],
      nextBestAction: (recRes.data ?? [])[0] ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("GET /api/dashboard/closeboss/lead/[id]:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
