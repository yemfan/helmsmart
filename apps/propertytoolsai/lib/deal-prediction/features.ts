import { supabaseAdmin } from "@/lib/supabase/admin";
import type { LeadPredictionFeatures } from "./types";

function minutesBetween(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  const diff = (new Date(b).getTime() - new Date(a).getTime()) / 60000;
  return Number.isFinite(diff) && diff >= 0 ? diff : null;
}

function priceFromLead(lead: Record<string, unknown>): number {
  const max = Number(lead.price_max);
  const min = Number(lead.price_min);
  if (Number.isFinite(max) && max > 0) return max;
  if (Number.isFinite(min) && min > 0) return min;
  const est = Number(lead.estimated_value ?? lead.property_value);
  if (Number.isFinite(est) && est > 0) return est;
  const notes = lead.notes;
  if (typeof notes === "string" && notes.trim().startsWith("{")) {
    try {
      const j = JSON.parse(notes) as Record<string, unknown>;
      const h = Number(j.maxHomePrice ?? j.property_value);
      if (Number.isFinite(h) && h > 0) return h;
    } catch {
      /* ignore */
    }
  }
  return 0;
}

export async function buildLeadPredictionFeatures(leadId: string): Promise<LeadPredictionFeatures> {
  const id = String(leadId);

  const [{ data: lead, error: leadError }, convRes, actRes] = await Promise.all([
    supabaseAdmin.from("leads").select("*").eq("id", id).maybeSingle(),
    supabaseAdmin
      .from("lead_conversations")
      .select("direction, created_at")
      .eq("lead_id", id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("lead_activity_events")
      .select("event_type, created_at")
      .eq("lead_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (leadError || !lead) {
    throw new Error("Lead not found for prediction");
  }

  const row = lead as Record<string, unknown>;
  const conv = convRes.data ?? [];
  const inboundCount = conv.filter((x: { direction?: string }) => x.direction === "inbound").length;
  const outboundCount = conv.filter((x: { direction?: string }) => x.direction === "outbound").length;
  const firstInbound = conv.find((x: { direction?: string }) => x.direction === "inbound");
  const firstOutbound = conv.find((x: { direction?: string }) => x.direction === "outbound");
  const avgResponseMinutes = minutesBetween(
    firstInbound?.created_at as string | undefined,
    firstOutbound?.created_at as string | undefined
  );

  const now = Date.now();
  const lastActivityAt =
    (row.last_activity_at as string | undefined) ||
    (conv.length ? (conv[conv.length - 1] as { created_at?: string }).created_at : undefined) ||
    (row.updated_at as string | undefined) ||
    (row.created_at as string | undefined);
  const hoursSinceLastActivity = lastActivityAt
    ? Number(((now - new Date(lastActivityAt).getTime()) / 3600000).toFixed(1))
    : null;

  const activityRows = actRes.data ?? [];
  const intentStr = String(row.intent ?? "").toLowerCase();
  const hasTourRequest =
    intentStr.includes("tour") ||
    activityRows.some((x: { event_type?: string }) =>
      ["tour_requested", "appointment_booked", "tour_request"].includes(String(x.event_type ?? ""))
    );

  const hasAppointmentSignal = activityRows.some((x: { event_type?: string }) =>
    ["appointment_booked", "tour_requested", "call_scheduled"].includes(String(x.event_type ?? ""))
  );

  return {
    source: (row.source as string) || null,
    intent: (row.intent as string) || null,
    leadScore: Number(row.lead_score ?? 0),
    engagementScore: Number(row.engagement_score ?? 0),
    leadTemperature: (row.lead_temperature as string) || null,
    hoursSinceLastActivity,
    inboundMessageCount: inboundCount,
    outboundMessageCount: outboundCount,
    hasReplyFromLead: inboundCount > 0,
    hasTourRequest,
    hasAppointmentSignal,
    assignedAgentId:
      row.assigned_agent_id != null
        ? String(row.assigned_agent_id)
        : row.agent_id != null
          ? String(row.agent_id)
          : null,
    avgResponseMinutes,
    pricePoint: priceFromLead(row),
    hasPhone: Boolean(
      (row.phone as string)?.trim() ||
        (row.phone as string)?.trim()
    ),
    hasEmail: Boolean((row.email as string)?.trim()),
    sourceSessionId:
      (row.source_session_id as string) ||
      (row.session_id as string) ||
      null,
    city: (row.city as string) || null,
  };
}
