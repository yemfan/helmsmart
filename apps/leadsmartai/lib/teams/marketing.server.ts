import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { isValidGaMeasurementId, isValidMetaPixelId } from "@/lib/marketing-hub/tracking";
import { buildTeamMarketing, isAutopilotMode, type MarketingInput, type TeamMarketing } from "./marketing";
import type { TeamRole } from "./types";

/**
 * Marketing across the team for a window: one bounded read per table for
 * the whole roster, split in memory — the same shape as performance, for the
 * same reason (a per-agent query per fact is thousands of round trips for a
 * brokerage). Every read degrades to "nothing" on error; a broker's view
 * that is missing one column is still a view.
 */

const ROW_LIMIT = 100_000;
const WINDOWS = new Set([7, 30, 90]);

export function normalizeMarketingDays(raw: unknown): number {
  const n = Number(raw);
  return WINDOWS.has(n) ? n : 30;
}

type Row = Record<string, unknown> & { agent_id: unknown };
type Result = { data: unknown; error: { message: string } | null };

export async function loadTeamMarketing(teamId: string, days: number): Promise<TeamMarketing> {
  const { data: memberRows } = await supabaseAdmin.from("team_memberships").select("agent_id, role").eq("team_id", teamId).limit(3000);
  const members = ((memberRows as { agent_id: unknown; role: TeamRole }[] | null) ?? []).map((r) => ({ agentId: String(r.agent_id), role: r.role }));
  if (members.length === 0) return buildTeamMarketing(days, []);
  const ids = members.map((m) => m.agentId) as never[];

  const nowIso = new Date().toISOString();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const read = async (label: string, build: () => PromiseLike<Result>): Promise<Row[]> => {
    try {
      const { data, error } = await build();
      if (error) console.warn(`[teams.marketing] ${label}:`, error.message);
      return (data as Row[] | null) ?? [];
    } catch (e) {
      console.warn(`[teams.marketing] ${label}:`, e instanceof Error ? e.message : e);
      return [];
    }
  };

  const [agents, networks, tracking, autopilot, published, failed, upcoming, traffic] = await Promise.all([
    read("agents", () =>
      supabaseAdmin
        .from("agents")
        .select("id, auth_user_id, hub_published, username")
        .in("id", ids)
        .then((r): Result => ({ data: ((r.data as Row[] | null) ?? []).map((a) => ({ ...a, agent_id: a.id })), error: r.error })),
    ),
    read("social_accounts", () => supabaseAdmin.from("social_accounts").select("agent_id, platform").in("agent_id", ids).eq("status", "connected").limit(ROW_LIMIT)),
    read("agent_tracking_config", () => supabaseAdmin.from("agent_tracking_config").select("agent_id, meta_pixel_id, ga_measurement_id").in("agent_id", ids).limit(ROW_LIMIT)),
    read("boss_autopilot_settings", () =>
      supabaseAdmin.from("boss_autopilot_settings").select("agent_id, mode").in("agent_id", ids).eq("assignee", "marketing_assistant").eq("channel", "social").limit(ROW_LIMIT),
    ),
    read("lead_posts", () => supabaseAdmin.from("lead_posts").select("agent_id, published_at").in("agent_id", ids).eq("status", "published").gte("published_at", since).limit(ROW_LIMIT)),
    read("scheduled_posts.failed", () => supabaseAdmin.from("scheduled_posts").select("agent_id").in("agent_id", ids).eq("status", "failed").gte("updated_at", since).limit(ROW_LIMIT)),
    read("scheduled_posts.upcoming", () =>
      supabaseAdmin.from("scheduled_posts").select("agent_id").in("agent_id", ids).in("status", ["scheduled", "awaiting_approval"]).gte("scheduled_for", nowIso).limit(ROW_LIMIT),
    ),
    read("traffic_events", () =>
      supabaseAdmin.from("traffic_events").select("agent_id, event_type").in("agent_id", ids).in("event_type", ["page_view", "conversion"]).gte("created_at", since).limit(ROW_LIMIT),
    ),
  ]);

  const userIds = agents.map((a) => a.auth_user_id).filter((v): v is string => typeof v === "string" && v.length > 0);
  const profiles = new Map<string, { full_name: string | null; email: string | null }>();
  if (userIds.length) {
    const { data } = await supabaseAdmin.from("user_profiles").select("user_id, full_name, email").in("user_id", userIds);
    for (const p of (data as { user_id: string; full_name: string | null; email: string | null }[] | null) ?? []) profiles.set(p.user_id, { full_name: p.full_name, email: p.email });
  }

  const byAgent = new Map<string, MarketingInput>();
  for (const m of members) {
    byAgent.set(m.agentId, {
      agentId: m.agentId,
      role: m.role,
      name: null,
      email: null,
      hubPublished: false,
      username: null,
      networks: [],
      gaConfigured: false,
      pixelConfigured: false,
      autopilotMode: null,
      postsPublished: 0,
      postsFailed: 0,
      scheduledUpcoming: 0,
      lastPostAt: null,
      hubViews: 0,
      hubLeads: 0,
    });
  }
  const at = (row: Row) => byAgent.get(String(row.agent_id));

  for (const a of agents) {
    const m = at(a);
    if (!m) continue;
    const p = typeof a.auth_user_id === "string" ? profiles.get(a.auth_user_id) : undefined;
    m.name = p?.full_name?.trim() || null;
    m.email = p?.email ?? null;
    m.hubPublished = Boolean(a.hub_published);
    m.username = typeof a.username === "string" && a.username ? a.username : null;
  }
  for (const r of networks) {
    const m = at(r);
    const platform = typeof r.platform === "string" ? r.platform : null;
    if (m && platform && !m.networks.includes(platform)) m.networks.push(platform);
  }
  for (const m of byAgent.values()) m.networks.sort();
  for (const r of tracking) {
    const m = at(r);
    if (!m) continue;
    m.gaConfigured = isValidGaMeasurementId(r.ga_measurement_id as string | null);
    m.pixelConfigured = isValidMetaPixelId(r.meta_pixel_id as string | null);
  }
  for (const r of autopilot) {
    const m = at(r);
    if (m) m.autopilotMode = isAutopilotMode(r.mode) ? r.mode : null;
  }
  for (const r of published) {
    const m = at(r);
    if (!m) continue;
    m.postsPublished += 1;
    const when = typeof r.published_at === "string" ? r.published_at : null;
    if (when && (!m.lastPostAt || when > m.lastPostAt)) m.lastPostAt = when;
  }
  for (const r of failed) {
    const m = at(r);
    if (m) m.postsFailed += 1;
  }
  for (const r of upcoming) {
    const m = at(r);
    if (m) m.scheduledUpcoming += 1;
  }
  for (const r of traffic) {
    const m = at(r);
    if (!m) continue;
    if (String(r.event_type) === "conversion") m.hubLeads += 1;
    else m.hubViews += 1;
  }

  return buildTeamMarketing(days, [...byAgent.values()]);
}
