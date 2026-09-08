import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildTeamPerformance, emptyMetrics, windowOf, type PerformanceInput, type PerformanceMetrics, type TeamPerformance } from "./performance";
import type { TeamRole } from "./types";

/**
 * Team performance for a window, read once per table for the whole team.
 *
 * A per-member count query for every metric would be members × metrics × two
 * windows — thousands of round trips for a brokerage. Instead each table is
 * read once for the members and both windows, with the agent id and the
 * timestamp only, and split in memory. Every read is bounded; a table over
 * its bound reports what it read, which is still the busiest agents' truth.
 */

const ROW_LIMIT = 100_000;
const WINDOWS = new Set([7, 30, 90, 365]);

export function normalizeDays(raw: unknown): number {
  const n = Number(raw);
  return WINDOWS.has(n) ? n : 30;
}

type Stamped = { agent_id: unknown } & Record<string, unknown>;

export async function loadTeamPerformance(teamId: string, days: number): Promise<TeamPerformance> {
  const { data: memberRows } = await supabaseAdmin.from("team_memberships").select("agent_id, role").eq("team_id", teamId).limit(3000);
  const members = ((memberRows as { agent_id: unknown; role: TeamRole }[] | null) ?? []).map((r) => ({ agentId: String(r.agent_id), role: r.role }));
  if (members.length === 0) return buildTeamPerformance(days, []);
  const ids = members.map((m) => m.agentId) as never[];

  const now = Date.now();
  const sinceBoth = new Date(now - 2 * days * 86_400_000).toISOString();
  const sinceBothDate = sinceBoth.slice(0, 10);

  type Filter = { eq?: [string, string]; neq?: [string, string]; in?: [string, string[]] };
  const read = async (table: string, cols: string, stamp: string, filter: Filter = {}) => {
    try {
      let q = supabaseAdmin.from(table).select(`agent_id, ${cols}`).in("agent_id", ids).gte(stamp, table === "transactions" ? sinceBothDate : sinceBoth);
      if (filter.eq) q = q.eq(filter.eq[0], filter.eq[1]);
      if (filter.neq) q = q.neq(filter.neq[0], filter.neq[1]);
      if (filter.in) q = q.in(filter.in[0], filter.in[1]);
      const { data, error } = await q.limit(ROW_LIMIT);
      if (error) console.warn(`[teams.performance] ${table}:`, error.message);
      return (data as Stamped[] | null) ?? [];
    } catch (e) {
      console.warn(`[teams.performance] ${table}:`, e instanceof Error ? e.message : e);
      return [];
    }
  };

  const [contacts, sms, emails, calls, appts, opened, closed, traffic, posts, agents] = await Promise.all([
    read("contacts", "created_at", "created_at"),
    read("sms_messages", "created_at", "created_at"),
    read("email_messages", "created_at", "created_at"),
    read("call_logs", "status, created_at", "created_at"),
    read("voice_appointments", "created_at", "created_at", { neq: ["status", "cancelled"] }),
    read("transactions", "mutual_acceptance_date", "mutual_acceptance_date"),
    read("transactions", "closing_date_actual, purchase_price, gross_commission", "closing_date_actual", { eq: ["status", "closed"] }),
    read("traffic_events", "event_type, created_at", "created_at", { in: ["event_type", ["page_view", "conversion"]] }),
    read("lead_posts", "published_at", "published_at", { eq: ["status", "published"] }),
    supabaseAdmin.from("agents").select("id, auth_user_id").in("id", ids).then((r) => (r.data as { id: unknown; auth_user_id: string | null }[] | null) ?? []),
  ]);

  const userIds = agents.map((a) => a.auth_user_id).filter((v): v is string => Boolean(v));
  const profiles = new Map<string, { full_name: string | null; email: string | null }>();
  if (userIds.length) {
    const { data } = await supabaseAdmin.from("user_profiles").select("user_id, full_name, email").in("user_id", userIds);
    for (const p of (data as { user_id: string; full_name: string | null; email: string | null }[] | null) ?? []) profiles.set(p.user_id, { full_name: p.full_name, email: p.email });
  }
  const userByAgent = new Map(agents.map((a) => [String(a.id), a.auth_user_id]));

  const cur = new Map<string, PerformanceMetrics>();
  const prev = new Map<string, PerformanceMetrics>();
  for (const m of members) {
    cur.set(m.agentId, emptyMetrics());
    prev.set(m.agentId, emptyMetrics());
  }
  const bump = (row: Stamped, stampCol: string, apply: (m: PerformanceMetrics, row: Stamped) => void) => {
    const w = windowOf(row[stampCol] as string | null, now, days);
    if (!w) return;
    const target = (w === "current" ? cur : prev).get(String(row.agent_id));
    if (target) apply(target, row);
  };

  for (const r of contacts) bump(r, "created_at", (m) => void (m.newLeads += 1));
  for (const r of sms) bump(r, "created_at", (m) => void (m.conversations += 1));
  for (const r of emails) bump(r, "created_at", (m) => void (m.conversations += 1));
  for (const r of calls) bump(r, "created_at", (m, row) => void (String(row.status) === "missed" || String(row.status) === "no_answer" ? (m.callsMissed += 1) : (m.callsAnswered += 1)));
  for (const r of appts) bump(r, "created_at", (m) => void (m.appointments += 1));
  for (const r of opened) bump(r, "mutual_acceptance_date", (m) => void (m.dealsOpened += 1));
  for (const r of closed) {
    bump(r, "closing_date_actual", (m, row) => {
      m.dealsClosed += 1;
      m.closedVolume += Number(row.purchase_price ?? 0) || 0;
      m.commission += Number(row.gross_commission ?? 0) || 0;
    });
  }
  for (const r of traffic) bump(r, "created_at", (m, row) => void (String(row.event_type) === "conversion" ? (m.hubLeads += 1) : (m.hubViews += 1)));
  for (const r of posts) bump(r, "published_at", (m) => void (m.postsPublished += 1));

  const input: PerformanceInput[] = members.map((m) => {
    const uid = userByAgent.get(m.agentId) ?? null;
    const p = uid ? profiles.get(uid) : undefined;
    return { agentId: m.agentId, role: m.role, name: p?.full_name ?? null, email: p?.email ?? null, current: cur.get(m.agentId)!, previous: prev.get(m.agentId)! };
  });
  return buildTeamPerformance(days, input);
}
