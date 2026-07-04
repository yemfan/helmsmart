import {
  leadRowToBaseSignals,
  overlayDashboardAlertSignals,
  type LeadAttentionRow,
} from "@/lib/lead-priority/leadAttentionSignals";
import { listMobileCalendarEvents } from "@/lib/mobile/calendarMobile";
import { getMobileInbox } from "@/lib/mobile/inbox";
import { listMobileTasksGrouped } from "@/lib/mobile/leadTasksMobile";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { scoreLeadAttention } from "@leadsmart/shared";
import type {
  MobileDashboardPriorityAlert,
  MobileDashboardQuickAction,
  MobileDashboardResponse,
  MobileDashboardStats,
} from "@leadsmart/shared";

const MAX_ALERTS = 20;

const DEFAULT_QUICK_ACTIONS: MobileDashboardQuickAction[] = [
  { key: "add_task", label: "Add task" },
  { key: "create_appointment", label: "Appointment" },
  { key: "send_booking_link", label: "Booking link" },
  { key: "open_hot_leads", label: "Hot leads" },
];

function utcDayRange(d: Date): { start: Date; end: Date } {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  return {
    start: new Date(Date.UTC(y, m, day, 0, 0, 0, 0)),
    end: new Date(Date.UTC(y, m, day, 23, 59, 59, 999)),
  };
}

function isEscalationMessage(message: string): boolean {
  return /escalat|human\s*escalation|needs\s*human|ai\s*sms\s*escalation|ai\s*email\s*escalation/i.test(
    message
  );
}

async function leadNamesForIds(agentId: string, ids: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const uniq = [...new Set(ids)].filter(Boolean);
  if (!uniq.length) return map;
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select("id,name")
    .eq("agent_id", agentId as never)
    .in("id", uniq as never);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const r = row as { id: unknown; name: unknown };
    map.set(String(r.id), r.name != null ? String(r.name) : null);
  }
  return map;
}

async function leadAttentionRowsForIds(
  agentId: string,
  ids: string[]
): Promise<Map<string, LeadAttentionRow>> {
  const map = new Map<string, LeadAttentionRow>();
  const uniq = [...new Set(ids)].filter(Boolean);
  if (!uniq.length) return map;
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select("id,rating,prediction_score,prediction_label")
    .eq("agent_id", agentId as never)
    .in("id", uniq as never);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const r = row as LeadAttentionRow & { id: unknown };
    map.set(String(r.id), r);
  }
  return map;
}

function enrichAndSortPriorityAlerts(
  alerts: MobileDashboardPriorityAlert[],
  leadById: Map<string, LeadAttentionRow>,
  unreadCountByLead: Map<string, number>
): MobileDashboardPriorityAlert[] {
  const enriched = alerts.map((a) => {
    const row = a.leadId ? leadById.get(a.leadId) : undefined;
    const base = leadRowToBaseSignals(row);
    const uc = a.leadId ? unreadCountByLead.get(a.leadId) ?? 0 : 0;
    const withThreads =
      uc > 1 ? { ...base, unreadInboundThreadCount: uc } : { ...base };
    const signals = overlayDashboardAlertSignals(withThreads, a.type);
    const r = scoreLeadAttention(signals);
    return {
      ...a,
      attentionScore: r.score,
      attentionPriority: r.priority,
      attentionReasons: r.reasons.slice(0, 3),
      deliveryTiming: r.deliveryTiming,
    };
  });
  enriched.sort((x, y) => (y.attentionScore ?? 0) - (x.attentionScore ?? 0));
  return enriched;
}

export async function getMobileDashboard(agentId: string): Promise<MobileDashboardResponse> {
  const now = new Date();
  const { start: dayStart, end: dayEnd } = utcDayRange(now);

  const [inbox, grouped, hotCountRes, todayEvents, nurtureRows, hotLeadRows] = await Promise.all([
    getMobileInbox(agentId),
    listMobileTasksGrouped(agentId),
    supabaseAdmin
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId as never)
      .is("merged_into_lead_id", null)
      .eq("rating", "hot"),
    listMobileCalendarEvents({
      agentId,
      fromIso: dayStart.toISOString(),
      toIso: dayEnd.toISOString(),
    }),
    supabaseAdmin
      .from("nurture_alerts")
      .select("contact_id,message,created_at")
      .eq("agent_id", agentId as never)
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("contacts")
      .select("id,name,last_activity_at")
      .eq("agent_id", agentId as never)
      .is("merged_into_lead_id", null)
      .eq("rating", "hot")
      .order("last_activity_at", { ascending: false, nullsFirst: false })
      .limit(5),
  ]);

  if (hotCountRes.error) throw new Error(hotCountRes.error.message);

  const hotRows = hotLeadRows.error ? [] : (hotLeadRows.data ?? []);

  const unreadThreads = inbox.filter((t) => t.lastDirection === "inbound");
  // Home summary copy reads "{tasks} tasks" (not "today"), so this is the
  // agent's actionable open-task count, not a due-today count. Bucketing on
  // due date alone dropped tasks with no/future due dates into `upcoming`,
  // which showed "0 tasks" for agents who clearly had open work (BUG-1).
  // `listMobileTasksGrouped` already filters `status = 'open'`, so summing the
  // three buckets == total open tasks. Field name kept as `tasksToday` for
  // wire-compat with the shipped v1.6 app that reads `stats.tasksToday`.
  const openTaskCount =
    grouped.overdue.length + grouped.today.length + grouped.upcoming.length;
  const stats: MobileDashboardStats = {
    hotLeads: hotCountRes.count ?? 0,
    unreadMessages: unreadThreads.length,
    tasksToday: openTaskCount,
    appointmentsToday: todayEvents.length,
  };

  const priorityAlerts: MobileDashboardPriorityAlert[] = [];

  for (const t of grouped.overdue.slice(0, 6)) {
    priorityAlerts.push({
      type: "overdue_task",
      leadId: t.contact_id,
      title: t.title,
      subtitle: t.lead_name ? `${t.lead_name}` : undefined,
      createdAt: t.due_at ?? undefined,
    });
  }

  const nurtureData = nurtureRows.error ? [] : (nurtureRows.data ?? []);
  const escRaw = nurtureData.filter((row) =>
    isEscalationMessage(String((row as { message?: unknown }).message ?? ""))
  );
  const escSlice = escRaw.slice(0, 6);
  const escLeadIds = escSlice.map((r) => String((r as { contact_id: unknown }).contact_id));
  const escNames = await leadNamesForIds(agentId, escLeadIds);
  for (const row of escSlice) {
    const r = row as { contact_id: unknown; message: unknown; created_at: unknown };
    const lid = String(r.contact_id ?? "");
    const nm = escNames.get(lid);
    const msg = String(r.message ?? "").slice(0, 120);
    priorityAlerts.push({
      type: "ai_escalation",
      leadId: lid,
      title: "AI requested a human",
      subtitle: nm ? `${nm} · ${msg}` : msg,
      createdAt: r.created_at != null ? String(r.created_at) : undefined,
    });
  }

  for (const t of unreadThreads.slice(0, 6)) {
    priorityAlerts.push({
      type: "unread_message",
      leadId: t.leadId,
      title: t.channel === "sms" ? "Unread SMS" : "Unread email",
      subtitle: t.leadName ? `${t.leadName} · ${t.preview.slice(0, 80)}` : t.preview.slice(0, 100),
      createdAt: t.lastMessageAt,
    });
  }

  for (const row of hotRows) {
    const r = row as { id: unknown; name: unknown; last_activity_at: unknown };
    priorityAlerts.push({
      type: "hot_lead",
      leadId: String(r.id ?? ""),
      title: "Hot lead",
      subtitle: r.name != null ? String(r.name) : `Lead ${String(r.id ?? "")}`,
      createdAt: r.last_activity_at != null ? String(r.last_activity_at) : undefined,
    });
  }

  const unreadCountByLead = new Map<string, number>();
  for (const t of unreadThreads) {
    unreadCountByLead.set(t.leadId, (unreadCountByLead.get(t.leadId) ?? 0) + 1);
  }

  const alertLeadIds = priorityAlerts.map((a) => a.leadId).filter(Boolean) as string[];
  const attentionRows = await leadAttentionRowsForIds(agentId, alertLeadIds);
  const ranked = enrichAndSortPriorityAlerts(priorityAlerts, attentionRows, unreadCountByLead);

  return {
    stats,
    priorityAlerts: ranked.slice(0, MAX_ALERTS),
    quickActions: DEFAULT_QUICK_ACTIONS,
  };
}
