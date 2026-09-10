import "server-only";

import type { AgentLicense } from "./license";
import { loadTeamLicenses } from "./license.server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { computeInviteExpiresAt, DEFAULT_INVITE_TTL_DAYS, generateInviteToken } from "./inviteToken";
import type { RosterRow } from "./roster";
import type { TeamRole } from "./types";
import { getSeatUsageForTeam } from "./seatLimits.server";

/**
 * Brokerage onboarding: many invitations at once, and a board that shows
 * where every agent is. The service layer bypasses RLS; the server actions
 * that call this have already checked the caller owns the team.
 */

export type InviteManyResult = {
  /** New invitations queued for the mailer. */
  invited: number;
  /** Pending invitations refreshed (new token and expiry, mailed again). */
  refreshed: number;
  /** Already on the team: nothing to send. */
  alreadyMembers: number;
  /** Rows the seat cap had no room for. */
  seatsShort: number;
  /** Seats after this import. */
  seats: { used: number; cap: number | null };
};

const BATCH = 200;

/** Queue invitations for a roster. Respects the seat cap: rows past it are counted, not sent. */
export async function inviteMany(args: { teamId: string; invitedByAgentId: string; rows: RosterRow[] }): Promise<InviteManyResult> {
  const seats = await getSeatUsageForTeam(args.teamId);
  if (!seats.teamAccess) {
    return { invited: 0, refreshed: 0, alreadyMembers: 0, seatsShort: args.rows.length, seats: { used: seats.used, cap: seats.cap } };
  }

  const emails = args.rows.map((r) => r.email);
  // Who is already in: accepted invitations and, for safety, memberships by email.
  const { data: existing } = await supabaseAdmin
    .from("team_invites")
    .select("invited_email, accepted_at")
    .eq("team_id", args.teamId)
    .in("invited_email", emails);
  const accepted = new Set<string>();
  const pending = new Set<string>();
  for (const r of (existing as { invited_email: string; accepted_at: string | null }[] | null) ?? []) {
    (r.accepted_at ? accepted : pending).add(r.invited_email);
  }

  const fresh = args.rows.filter((r) => !accepted.has(r.email));
  // Refreshing a pending invitation does not take a new seat; a new one does.
  const newOnes = fresh.filter((r) => !pending.has(r.email));
  const room = seats.cap == null ? newOnes.length : Math.max(0, seats.available ?? 0);
  const allowedNew = new Set(newOnes.slice(0, room).map((r) => r.email));
  const toWrite = fresh.filter((r) => pending.has(r.email) || allowedNew.has(r.email));

  const nowIso = new Date().toISOString();
  const expiresAt = computeInviteExpiresAt({ nowIso, days: DEFAULT_INVITE_TTL_DAYS });
  for (let i = 0; i < toWrite.length; i += BATCH) {
    const chunk = toWrite.slice(i, i + BATCH).map((r) => ({
      team_id: args.teamId,
      invited_email: r.email,
      invited_name: r.name,
      invited_phone: r.phone,
      token_hash: generateInviteToken().tokenHash,
      invited_by_agent_id: args.invitedByAgentId,
      expires_at: expiresAt,
      accepted_at: null,
      accepted_by_agent_id: null,
      source: "roster",
      email_sent_at: null,
      email_attempts: 0,
      email_error: null,
    }));
    const { error } = await supabaseAdmin.from("team_invites").upsert(chunk as never[], { onConflict: "team_id,invited_email" });
    if (error) throw new Error(error.message);
  }

  return {
    invited: allowedNew.size,
    refreshed: toWrite.length - allowedNew.size,
    alreadyMembers: args.rows.length - fresh.length,
    seatsShort: newOnes.length - allowedNew.size,
    seats: { used: seats.used + allowedNew.size, cap: seats.cap },
  };
}

/** Put one invitation back in the mailer's queue with a fresh token and expiry. */
export async function requeueInvite(args: { teamId: string; inviteId: string }): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const { error, count } = await supabaseAdmin
    .from("team_invites")
    .update(
      {
        token_hash: generateInviteToken().tokenHash,
        expires_at: computeInviteExpiresAt({ nowIso, days: DEFAULT_INVITE_TTL_DAYS }),
        email_sent_at: null,
        email_attempts: 0,
        email_error: null,
      } as never,
      { count: "exact" },
    )
    .eq("id", args.inviteId)
    .eq("team_id", args.teamId)
    .is("accepted_at", null);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

// ── The board ───────────────────────────────────────────────────────────────

export type BoardMember = {
  agentId: string;
  /** The license the brokerage requires, or null when not entered yet. */
  license: AgentLicense | null;
  name: string | null;
  email: string | null;
  role: TeamRole;
  joinedAt: string;
  onboardingCompleted: boolean;
  hubPublished: boolean;
  username: string | null;
  connections: number;
  contacts: number;
};

export type BoardInvite = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  expiresAt: string;
  emailSentAt: string | null;
  emailError: string | null;
  attempts: number;
  expired: boolean;
};

export type OnboardingBoard = {
  members: BoardMember[];
  invites: BoardInvite[];
  totals: { members: number; onboarded: number; hubsLive: number; connected: number; pending: number; queued: number; failed: number; expired: number };
};

export async function getOnboardingBoard(teamId: string): Promise<OnboardingBoard> {
  const nowIso = new Date().toISOString();
  const [{ data: memberRows }, { data: inviteRows }] = await Promise.all([
    supabaseAdmin.from("team_memberships").select("agent_id, role, created_at").eq("team_id", teamId).order("created_at", { ascending: true }).limit(3000),
    supabaseAdmin
      .from("team_invites")
      .select("id, invited_email, invited_name, created_at, expires_at, email_sent_at, email_error, email_attempts")
      .eq("team_id", teamId)
      .is("accepted_at", null)
      .order("created_at", { ascending: false })
      .limit(3000),
  ]);
  const members = (memberRows as { agent_id: unknown; role: string; created_at: string }[] | null) ?? [];
  const ids = members.map((m) => String(m.agent_id));

  let agents: Record<string, unknown>[] = [];
  let profiles = new Map<string, { full_name: string | null; email: string | null }>();
  const connections = new Map<string, number>();
  const contacts = new Map<string, number>();
  let licenses = new Map<string, AgentLicense>();
  if (ids.length) {
    const [{ data: agentRows }, { data: connRows }, { data: contactRows }, licenseRows] = await Promise.all([
      supabaseAdmin.from("agents").select("id, auth_user_id, onboarding_completed, hub_published, username").in("id", ids as never[]),
      supabaseAdmin.from("social_accounts").select("agent_id").in("agent_id", ids as never[]).eq("status", "connected").limit(20000),
      supabaseAdmin.from("contacts").select("agent_id").in("agent_id", ids as never[]).limit(200000),
      loadTeamLicenses(teamId),
    ]);
    licenses = licenseRows;
    agents = (agentRows as Record<string, unknown>[] | null) ?? [];
    for (const c of (connRows as { agent_id: unknown }[] | null) ?? []) connections.set(String(c.agent_id), (connections.get(String(c.agent_id)) ?? 0) + 1);
    for (const c of (contactRows as { agent_id: unknown }[] | null) ?? []) contacts.set(String(c.agent_id), (contacts.get(String(c.agent_id)) ?? 0) + 1);
    const userIds = agents.map((a) => a.auth_user_id).filter((v): v is string => typeof v === "string");
    if (userIds.length) {
      const { data: profRows } = await supabaseAdmin.from("user_profiles").select("user_id, full_name, email").in("user_id", userIds);
      profiles = new Map(((profRows as { user_id: string; full_name: string | null; email: string | null }[] | null) ?? []).map((p) => [p.user_id, { full_name: p.full_name, email: p.email }]));
    }
  }
  const agentById = new Map(agents.map((a) => [String(a.id), a]));

  const boardMembers: BoardMember[] = members.map((m) => {
    const id = String(m.agent_id);
    const a = agentById.get(id);
    const p = a && typeof a.auth_user_id === "string" ? profiles.get(a.auth_user_id) : undefined;
    return {
      agentId: id,
      license: licenses.get(id) ?? null,
      name: p?.full_name ?? null,
      email: p?.email ?? null,
      role: m.role === "manager" ? "manager" : m.role === "owner" ? "owner" : "member",
      joinedAt: m.created_at,
      onboardingCompleted: Boolean(a?.onboarding_completed),
      hubPublished: Boolean(a?.hub_published),
      username: typeof a?.username === "string" && a.username ? a.username : null,
      connections: connections.get(id) ?? 0,
      contacts: contacts.get(id) ?? 0,
    };
  });

  const boardInvites: BoardInvite[] = ((inviteRows as Record<string, unknown>[] | null) ?? []).map((r) => ({
    id: String(r.id),
    email: String(r.invited_email ?? ""),
    name: typeof r.invited_name === "string" ? r.invited_name : null,
    createdAt: String(r.created_at ?? ""),
    expiresAt: String(r.expires_at ?? ""),
    emailSentAt: typeof r.email_sent_at === "string" ? r.email_sent_at : null,
    emailError: typeof r.email_error === "string" ? r.email_error : null,
    attempts: Number(r.email_attempts ?? 0),
    expired: String(r.expires_at ?? "") < nowIso,
  }));

  return {
    members: boardMembers,
    invites: boardInvites,
    totals: {
      members: boardMembers.length,
      onboarded: boardMembers.filter((m) => m.onboardingCompleted).length,
      hubsLive: boardMembers.filter((m) => m.hubPublished).length,
      connected: boardMembers.filter((m) => m.connections > 0).length,
      pending: boardInvites.filter((i) => !i.expired).length,
      queued: boardInvites.filter((i) => !i.expired && !i.emailSentAt && !i.emailError).length,
      failed: boardInvites.filter((i) => !i.expired && !i.emailSentAt && Boolean(i.emailError)).length,
      expired: boardInvites.filter((i) => i.expired).length,
    },
  };
}
