"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getTeamAccessStatus } from "@/lib/teams/access.server";
import { TeamSeatError } from "@/lib/teams/seatLimits.server";
import {
  createTeam as svcCreateTeam,
  getRole,
  inviteByEmail,
  removeMember as svcRemoveMember,
  revokeInvite as svcRevokeInvite,
  setMemberRole as svcSetMemberRole,
} from "@/lib/teams/service";
import { inviteMany, requeueInvite } from "@/lib/teams/onboarding.server";
import { MAX_ROSTER_ROWS, parseRoster } from "@/lib/teams/roster";
import { parseBrandInput } from "@/lib/teams/brand";
import { canAdministerTeam, canManageTeam, isAssignableRole } from "@/lib/teams/roles";
import { saveTeamBrand } from "@/lib/teams/brand.server";
import { ATTENTION_KEYS, type Attention } from "@/lib/teams/marketing";
import { nudgeAttention } from "@/lib/teams/nudges.server";

/**
 * Server actions for the /dashboard/team UI.
 *
 * Every action resolves the calling agent via getCurrentAgentContext()
 * and authorizes itself before touching the service layer. The
 * service layer bypasses RLS via the service-role client, so this
 * file is the trust boundary.
 */

export async function createTeam(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false as const, error: "Name is required" };
  if (name.length > 80) return { ok: false as const, error: "Name too long" };

  const ctx = await getCurrentAgentContext();

  // Pre-flight: block creation when the plan can't host a team.
  // Without this gate, a Starter agent could create a team and then
  // hit "Owner's plan does not include team access" on every invite —
  // a confusing dead-end with a useless team row in the DB.
  const access = await getTeamAccessStatus(ctx.agentId);
  if (!access.canCreate) {
    return {
      ok: false as const,
      error:
        access.reason === "team_access_not_enabled"
          ? "Team access comes with the Premium and Signature plans. Upgrade to start a team."
          : "We couldn't verify your subscription. Try again or contact support.",
      code: access.reason,
    };
  }

  const team = await svcCreateTeam({ name, ownerAgentId: ctx.agentId });
  revalidatePath("/dashboard/team");
  return { ok: true as const, teamId: team.id };
}

export async function inviteMember(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!teamId) return { ok: false as const, error: "Missing team" };
  if (!email || !email.includes("@")) {
    return { ok: false as const, error: "Valid email required" };
  }

  const ctx = await getCurrentAgentContext();
  const role = await getRole({ teamId, agentId: ctx.agentId });
  if (!canManageTeam(role)) return { ok: false as const, error: "Owner or manager only" };

  try {
    const result = await inviteByEmail({
      teamId,
      invitedEmail: email,
      invitedByAgentId: ctx.agentId,
    });
    revalidatePath("/dashboard/team");
    return {
      ok: true as const,
      inviteId: result.invite.id,
      rawToken: result.rawToken,
    };
  } catch (e) {
    if (e instanceof TeamSeatError) {
      return { ok: false as const, error: e.message };
    }
    throw e;
  }
}

export async function removeMember(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  const agentId = String(formData.get("agentId") ?? "");
  if (!teamId || !agentId) return { ok: false as const, error: "Missing args" };

  const ctx = await getCurrentAgentContext();
  if (agentId === ctx.agentId) {
    return { ok: false as const, error: "Owner cannot remove themselves" };
  }
  const role = await getRole({ teamId, agentId: ctx.agentId });
  if (!canAdministerTeam(role)) return { ok: false as const, error: "Owner only" };

  await svcRemoveMember({ teamId, agentId });
  revalidatePath("/dashboard/team");
  return { ok: true as const };
}

export async function revokeInvite(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  const inviteId = String(formData.get("inviteId") ?? "");
  if (!teamId || !inviteId) return { ok: false as const, error: "Missing args" };

  const ctx = await getCurrentAgentContext();
  const role = await getRole({ teamId, agentId: ctx.agentId });
  if (!canManageTeam(role)) return { ok: false as const, error: "Owner or manager only" };

  await svcRevokeInvite(inviteId);
  revalidatePath("/dashboard/team");
  return { ok: true as const };
}

/**
 * Bulk onboarding: a pasted or uploaded roster becomes queued invitations,
 * emailed by the team-invite-mailer cron. Owner only. Returns counts, never
 * a wall of text: what was queued, what was refreshed, who was already in,
 * and how many rows the seat cap had no room for.
 */
export async function importRoster(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  const text = String(formData.get("roster") ?? "");
  if (!teamId) return { ok: false as const, error: "Missing team" };
  if (!text.trim()) return { ok: false as const, error: "Paste a roster or choose a file first." };
  if (text.length > 2_000_000) return { ok: false as const, error: "That file is too large. Split it and import in parts." };

  const ctx = await getCurrentAgentContext();
  const role = await getRole({ teamId, agentId: ctx.agentId });
  if (!canManageTeam(role)) return { ok: false as const, error: "Only the team owner or a manager can import a roster." };

  const parsed = parseRoster(text);
  if (parsed.rows.length === 0) {
    return { ok: false as const, error: "No email addresses found in that roster.", problems: parsed.problems.slice(0, 20) };
  }

  try {
    const result = await inviteMany({ teamId, invitedByAgentId: ctx.agentId, rows: parsed.rows });
    revalidatePath("/dashboard/team");
    return { ok: true as const, ...result, rowsRead: parsed.rows.length, capped: parsed.rows.length >= MAX_ROSTER_ROWS, problems: parsed.problems.slice(0, 20), problemCount: parsed.problems.length };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Import failed" };
  }
}

/** Put one pending invitation back in the mailer's queue (fresh link, fresh expiry). Owner only. */
export async function resendInvite(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  const inviteId = String(formData.get("inviteId") ?? "");
  if (!teamId || !inviteId) return { ok: false as const, error: "Missing args" };
  const ctx = await getCurrentAgentContext();
  const role = await getRole({ teamId, agentId: ctx.agentId });
  if (!canManageTeam(role)) return { ok: false as const, error: "Only the team owner or a manager can resend invitations." };
  const ok = await requeueInvite({ teamId, inviteId });
  revalidatePath("/dashboard/team");
  return ok ? { ok: true as const } : { ok: false as const, error: "That invitation is no longer pending." };
}

/**
 * Email every agent in one attention bucket ("no hub yet", ...). Owner or
 * manager. Each agent hears about a reason at most once a week, so a
 * second click reports what was skipped rather than sending again.
 */
export async function nudgeAgents(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!teamId || !(ATTENTION_KEYS as readonly string[]).includes(reason)) return { ok: false as const, error: "Missing args" };
  const ctx = await getCurrentAgentContext();
  const role = await getRole({ teamId, agentId: ctx.agentId });
  if (!canManageTeam(role)) return { ok: false as const, error: "Only the team owner or a manager can email agents." };
  try {
    const r = await nudgeAttention({ teamId, reason: reason as Attention, byAgentId: ctx.agentId });
    return { ok: true as const, ...r };
  } catch (e) {
    console.error("[team.nudge]", e instanceof Error ? e.message : e);
    return { ok: false as const, error: "We could not send those emails right now. Try again in a minute." };
  }
}

/** The brokerage brand shown on every member hub. Owner only. An emptied form clears it. */
export async function saveBrand(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  if (!teamId) return { ok: false as const, error: "Missing team", field: null };
  const ctx = await getCurrentAgentContext();
  const role = await getRole({ teamId, agentId: ctx.agentId });
  if (!canManageTeam(role)) return { ok: false as const, error: "Only the team owner or a manager can set the brokerage brand.", field: null };
  const parsed = parseBrandInput({
    name: formData.get("name"),
    logoUrl: formData.get("logoUrl"),
    website: formData.get("website"),
    license: formData.get("license"),
    disclosure: formData.get("disclosure"),
  });
  if (!parsed.ok) return { ok: false as const, error: "invalid", field: parsed.field };
  try {
    await saveTeamBrand(teamId, parsed.brand);
    revalidatePath("/dashboard/team");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Save failed", field: null };
  }
}

/** Owner only: make a member a manager, or a manager a member. Ownership never moves here. */
export async function setRole(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  const agentId = String(formData.get("agentId") ?? "");
  const role = formData.get("role");
  if (!teamId || !agentId || !isAssignableRole(role)) return { ok: false as const, error: "Missing args" };
  const ctx = await getCurrentAgentContext();
  if (agentId === ctx.agentId) return { ok: false as const, error: "You cannot change your own role." };
  const mine = await getRole({ teamId, agentId: ctx.agentId });
  if (!canAdministerTeam(mine)) return { ok: false as const, error: "Owner only" };
  await svcSetMemberRole({ teamId, agentId, role });
  revalidatePath("/dashboard/team");
  return { ok: true as const };
}
