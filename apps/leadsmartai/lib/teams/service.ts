import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  computeInviteExpiresAt,
  DEFAULT_INVITE_TTL_DAYS,
  generateInviteToken,
  hashInviteToken,
  isInviteUsable,
} from "./inviteToken";
import { assertCanAddSeatToTeam } from "./seatLimits.server";
import type {
  Team,
  TeamInvite,
  TeamMembership,
  TeamRole,
  TeamRoster,
} from "./types";

/**
 * Server-side team management. Bypasses RLS via the service-role
 * client because most of these operations run in webhook /
 * server-action paths where the caller has already resolved the
 * acting agent. Routes that hit this surface should validate
 * authorization themselves (e.g. `actingAgentId` is the team owner)
 * before calling.
 *
 * Phase 1 lays the data model. Subsequent PRs wire UI + queries.
 */

export async function createTeam(args: {
  name: string;
  ownerAgentId: string;
}): Promise<Team> {
  const { data, error } = await supabaseAdmin
    .from("teams")
    .insert({ name: args.name.trim(), owner_agent_id: args.ownerAgentId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapTeam(data as Record<string, unknown>);
}

export async function getTeam(teamId: string): Promise<Team | null> {
  const { data, error } = await supabaseAdmin
    .from("teams")
    .select("*")
    .eq("id", teamId)
    .maybeSingle();
  if (error) {
    console.warn("[teams] getTeam failed:", error);
    return null;
  }
  return data ? mapTeam(data as Record<string, unknown>) : null;
}

/** Teams the agent belongs to (any role). */
export async function listTeamsForAgent(agentId: string): Promise<Team[]> {
  const { data, error } = await supabaseAdmin
    .from("team_memberships")
    .select("team_id, teams!inner(id,name,owner_agent_id,created_at,updated_at)")
    .eq("agent_id", agentId);
  if (error) {
    console.warn("[teams] listTeamsForAgent failed:", error);
    return [];
  }
  return (data ?? []).map((row: Record<string, unknown>) => {
    const t = row.teams as Record<string, unknown>;
    return mapTeam(t);
  });
}

export async function getRoster(teamId: string): Promise<TeamRoster | null> {
  const team = await getTeam(teamId);
  if (!team) return null;

  const [{ data: memberRows }, { data: inviteRows }] = await Promise.all([
    supabaseAdmin
      .from("team_memberships")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("team_invites")
      .select("*")
      .eq("team_id", teamId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  return {
    team,
    members: (memberRows ?? []).map((r) => mapMembership(r as Record<string, unknown>)),
    pendingInvites: (inviteRows ?? []).map((r) => mapInvite(r as Record<string, unknown>)),
  };
}

/** The agent's role in the team, or null if not a member. */
export async function getRole(args: {
  teamId: string;
  agentId: string;
}): Promise<TeamRole | null> {
  const { data, error } = await supabaseAdmin
    .from("team_memberships")
    .select("role")
    .eq("team_id", args.teamId)
    .eq("agent_id", args.agentId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { role?: TeamRole }).role ?? null;
}

export async function inviteByEmail(args: {
  teamId: string;
  invitedEmail: string;
  invitedByAgentId: string;
  ttlDays?: number;
  /** Override "now" for tests. */
  nowIso?: string;
}): Promise<{ invite: TeamInvite; rawToken: string }> {
  // Block at the gate when the owner's plan is wrong tier or the
  // team is full. Throws TeamSeatError; the caller (server action)
  // surfaces a friendly message to the agent.
  await assertCanAddSeatToTeam(args.teamId);

  const nowIso = args.nowIso ?? new Date().toISOString();
  const expiresAt = computeInviteExpiresAt({
    nowIso,
    days: args.ttlDays ?? DEFAULT_INVITE_TTL_DAYS,
  });
  const { rawToken, tokenHash } = generateInviteToken();
  const email = args.invitedEmail.trim().toLowerCase();

  // Upsert by (team_id, invited_email) — re-inviting the same email
  // refreshes the token + expiry instead of erroring.
  const { data, error } = await supabaseAdmin
    .from("team_invites")
    .upsert(
      {
        team_id: args.teamId,
        invited_email: email,
        token_hash: tokenHash,
        invited_by_agent_id: args.invitedByAgentId,
        expires_at: expiresAt,
        accepted_at: null,
        accepted_by_agent_id: null,
      },
      { onConflict: "team_id,invited_email" },
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  return {
    invite: mapInvite(data as Record<string, unknown>),
    rawToken,
  };
}

/**
 * Accept an invite by raw token. The agent calling this must already
 * be authenticated. We hash the raw token, look up the row, verify
 * it's still usable, then atomically:
 *   1. Insert the membership row (idempotent on the PK)
 *   2. Mark the invite accepted
 *
 * Returns the membership on success or `{ error: 'expired'|'used'|'not_found' }`.
 */
export async function acceptInvite(args: {
  rawToken: string;
  acceptingAgentId: string;
  nowIso?: string;
}): Promise<
  | { ok: true; membership: TeamMembership }
  | { ok: false; reason: "expired" | "used" | "not_found" }
> {
  const nowIso = args.nowIso ?? new Date().toISOString();
  const tokenHash = hashInviteToken(args.rawToken);

  const { data: invite, error: inviteErr } = await supabaseAdmin
    .from("team_invites")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (inviteErr || !invite) return { ok: false, reason: "not_found" };

  const inviteRow = invite as Record<string, unknown>;
  if (inviteRow.accepted_at) return { ok: false, reason: "used" };
  if (
    !isInviteUsable({
      expiresAt: String(inviteRow.expires_at ?? ""),
      acceptedAt: (inviteRow.accepted_at as string | null) ?? null,
      nowIso,
    })
  ) {
    return { ok: false, reason: "expired" };
  }

  // Someone already on the team (the owner opening a test invitation, a
  // manager clicking a second link) keeps the role they have. The upsert this
  // replaced wrote role = 'member' over whatever was there and demoted the
  // team owner to a member of their own team.
  const { data: existing } = await supabaseAdmin
    .from("team_memberships")
    .select("*")
    .eq("team_id", inviteRow.team_id as never)
    .eq("agent_id", args.acceptingAgentId as never)
    .maybeSingle();
  let membership = existing as Record<string, unknown> | null;
  if (!membership) {
    const { data: created, error: memberErr } = await supabaseAdmin
      .from("team_memberships")
      .insert({ team_id: inviteRow.team_id, agent_id: args.acceptingAgentId, role: "member" })
      .select("*")
      .single();
    if (memberErr) throw new Error(memberErr.message);
    membership = created as Record<string, unknown>;
  }

  await supabaseAdmin
    .from("team_invites")
    .update({
      accepted_at: nowIso,
      accepted_by_agent_id: args.acceptingAgentId,
    })
    .eq("id", inviteRow.id);

  return {
    ok: true,
    membership: mapMembership(membership),
  };
}

export async function removeMember(args: {
  teamId: string;
  agentId: string;
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from("team_memberships")
    .delete()
    .eq("team_id", args.teamId)
    .eq("agent_id", args.agentId);
  if (error) throw new Error(error.message);
}

/** Owner-only, enforced by the caller: a member becomes a manager, or a manager a member. */
export async function setMemberRole(args: { teamId: string; agentId: string; role: "manager" | "member" }): Promise<void> {
  const { error } = await supabaseAdmin
    .from("team_memberships")
    .update({ role: args.role })
    .eq("team_id", args.teamId)
    .eq("agent_id", args.agentId)
    .neq("role", "owner");
  if (error) throw new Error(error.message);
}

export async function revokeInvite(inviteId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("team_invites")
    .delete()
    .eq("id", inviteId);
  if (error) throw new Error(error.message);
}

// ── row mappers ────────────────────────────────────────────────

function mapTeam(row: Record<string, unknown>): Team {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    ownerAgentId: String(row.owner_agent_id ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function mapMembership(row: Record<string, unknown>): TeamMembership {
  return {
    teamId: String(row.team_id ?? ""),
    agentId: String(row.agent_id ?? ""),
    role: (row.role as TeamRole) ?? "member",
    createdAt: String(row.created_at ?? ""),
  };
}

function mapInvite(row: Record<string, unknown>): TeamInvite {
  return {
    id: String(row.id ?? ""),
    teamId: String(row.team_id ?? ""),
    invitedEmail: String(row.invited_email ?? ""),
    invitedByAgentId: String(row.invited_by_agent_id ?? ""),
    expiresAt: String(row.expires_at ?? ""),
    acceptedAt: (row.accepted_at as string | null) ?? null,
    acceptedByAgentId: (row.accepted_by_agent_id as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
  };
}
