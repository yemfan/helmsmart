import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAgentDisplayName } from "@/lib/ai-call/lead-resolution";
import { emptyReactions, orderAnnouncements, pickForDashboard, type Announcement, type AnnouncementInput, type Reaction } from "./billboard";
import { loadTeamBrand } from "./brand.server";
import { listTeamsForAgent } from "./service";

/**
 * The billboard: read for a viewer, post, pin, remove, mark read, react,
 * and queue the email when a post asks for one. Reads are one query per
 * table for the whole board; the counts are folded in memory.
 */

type Row = {
  id: string;
  kind: Announcement["kind"];
  title: string;
  body: string | null;
  link_url: string | null;
  shoutout_agent_id: unknown;
  author_agent_id: unknown;
  pinned: boolean;
  expires_at: string | null;
  email_requested_at: string | null;
  created_at: string;
};

const COLS = "id, kind, title, body, link_url, shoutout_agent_id, author_agent_id, pinned, expires_at, email_requested_at, created_at";
const BOARD_LIMIT = 200;

function toAnnouncement(r: Row): Announcement {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    linkUrl: r.link_url,
    shoutoutAgentId: r.shoutout_agent_id == null ? null : String(r.shoutout_agent_id),
    authorAgentId: r.author_agent_id == null ? null : String(r.author_agent_id),
    pinned: Boolean(r.pinned),
    expiresAt: r.expires_at,
    emailRequestedAt: r.email_requested_at,
    createdAt: r.created_at,
    readCount: 0,
    reactions: emptyReactions(),
    mine: { read: false, reaction: null },
  };
}

/** The live board for one viewer, pinned first, with reach and reactions folded in. */
export async function listBillboard(teamId: string, viewerAgentId: string): Promise<Announcement[]> {
  try {
    const nowIso = new Date().toISOString();
    const { data } = await supabaseAdmin
      .from("team_announcements")
      .select(COLS)
      .eq("team_id", teamId)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(BOARD_LIMIT);
    const items = ((data as Row[] | null) ?? []).map(toAnnouncement);
    if (!items.length) return [];
    const ids = items.map((a) => a.id);
    const { data: reads } = await supabaseAdmin.from("team_announcement_reads").select("announcement_id, agent_id, reaction").in("announcement_id", ids).limit(200_000);
    const byId = new Map(items.map((a) => [a.id, a]));
    for (const r of (reads as { announcement_id: string; agent_id: unknown; reaction: Reaction | null }[] | null) ?? []) {
      const a = byId.get(r.announcement_id);
      if (!a) continue;
      a.readCount += 1;
      if (r.reaction) a.reactions[r.reaction] += 1;
      if (String(r.agent_id) === viewerAgentId) a.mine = { read: true, reaction: r.reaction };
    }
    return orderAnnouncements(items);
  } catch (e) {
    console.warn("[teams.billboard] list failed:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** For the dashboard: the agent's first team, its name, and the few posts worth a glance. */
export async function billboardForDashboard(agentId: string): Promise<{ teamId: string; brokerage: string; items: Announcement[]; total: number } | null> {
  const teams = await listTeamsForAgent(agentId).catch(() => []);
  const team = teams[0];
  if (!team) return null;
  const [items, brand] = await Promise.all([listBillboard(team.id, agentId), loadTeamBrand(team.id).catch(() => null)]);
  if (!items.length) return null;
  return { teamId: team.id, brokerage: brand?.name ?? team.name, items: pickForDashboard(items, 3), total: items.length };
}

export async function createAnnouncement(args: { teamId: string; authorAgentId: string | null; input: AnnouncementInput }): Promise<Announcement> {
  const { teamId, authorAgentId, input } = args;
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("team_announcements")
    .insert({
      team_id: teamId,
      author_agent_id: authorAgentId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      link_url: input.linkUrl,
      shoutout_agent_id: input.shoutoutAgentId,
      pinned: input.pinned,
      expires_at: input.expiresAt,
      email_requested_at: input.email ? now : null,
    } as never)
    .select(COLS)
    .single();
  if (error) throw new Error(error.message);
  const a = toAnnouncement(data as Row);
  if (input.email) await queueEmails(teamId, a.id).catch((e) => console.warn("[teams.billboard] email queue failed:", e instanceof Error ? e.message : e));
  return a;
}

/** One queue row per member; the cron drains them. The author is not emailed their own post. */
async function queueEmails(teamId: string, announcementId: string): Promise<void> {
  const { data } = await supabaseAdmin.from("team_memberships").select("agent_id").eq("team_id", teamId).limit(5000);
  const rows = ((data as { agent_id: unknown }[] | null) ?? []).map((m) => ({ announcement_id: announcementId, agent_id: String(m.agent_id) }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabaseAdmin.from("team_announcement_emails").upsert(rows.slice(i, i + 500) as never[], { onConflict: "announcement_id,agent_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
}

export async function setPinned(teamId: string, id: string, pinned: boolean): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("team_announcements").update({ pinned, updated_at: new Date().toISOString() } as never).eq("team_id", teamId).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length > 0;
}

export async function removeAnnouncement(teamId: string, id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("team_announcements").delete().eq("team_id", teamId).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length > 0;
}

/** Opening the board marks what was on it read; a reaction is a read too. */
export async function markRead(agentId: string, ids: readonly string[]): Promise<void> {
  if (!ids.length) return;
  const rows = ids.map((id) => ({ announcement_id: id, agent_id: agentId }));
  const { error } = await supabaseAdmin.from("team_announcement_reads").upsert(rows as never[], { onConflict: "announcement_id,agent_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

export async function react(agentId: string, id: string, reaction: Reaction | null): Promise<void> {
  const { error } = await supabaseAdmin.from("team_announcement_reads").upsert({ announcement_id: id, agent_id: agentId, reaction } as never, { onConflict: "announcement_id,agent_id" });
  if (error) throw new Error(error.message);
}

/**
 * The system's welcome when someone joins: one per member, ever. Posted
 * from the accept flow; a failure there must not stop the join.
 */
export async function postWelcome(teamId: string, agentId: string): Promise<void> {
  try {
    const { data: existing } = await supabaseAdmin.from("team_announcements").select("id").eq("team_id", teamId).eq("kind", "welcome").eq("shoutout_agent_id", agentId as never).limit(1);
    if (Array.isArray(existing) && existing.length) return;
    const name = (await getAgentDisplayName(agentId).catch(() => null)) ?? "A new agent";
    const expires = new Date(Date.now() + 14 * 86_400_000).toISOString();
    await supabaseAdmin.from("team_announcements").insert({ team_id: teamId, author_agent_id: null, kind: "welcome", title: `Welcome ${name}`, body: null, shoutout_agent_id: agentId, pinned: false, expires_at: expires } as never);
  } catch (e) {
    console.warn("[teams.billboard] welcome failed:", e instanceof Error ? e.message : e);
  }
}
