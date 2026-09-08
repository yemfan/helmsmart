import "server-only";

import { PLAN_CATALOG } from "@/lib/entitlements/planCatalog";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  type AgentEntitlement,
  type AgentPlan,
} from "@/lib/entitlements/types";
import { computeSeatUsage, type SeatUsage } from "./seats";

/**
 * Server-side seat-limit check for the team service layer.
 *
 * `getSeatUsageForTeam(teamId)` looks up the team's owner, reads the
 * owner's active entitlement to find the plan-defined cap, then
 * counts current members + active invites and runs the pure
 * computeSeatUsage(). Returns the usage struct plus a bit indicating
 * whether the owner's plan even allows team access at all.
 *
 * `assertCanAddSeatToTeam(teamId)` throws a structured error when
 * the team is full or the owner's plan doesn't allow teams. Called
 * by inviteByEmail before creating a new pending invite.
 *
 * Bypasses RLS via the service-role client — caller has already
 * authorized the action.
 */

export type TeamSeatStatus = SeatUsage & {
  /** Owner's plan tier. Null when no entitlement found (treats as 0 cap). */
  plan: AgentPlan | null;
  /** Owner's plan-level toggle. False blocks all team operations. */
  teamAccess: boolean;
};

export class TeamSeatError extends Error {
  readonly code: "team_seat_cap_reached" | "team_access_not_enabled";
  readonly status: TeamSeatStatus;
  constructor(
    code: "team_seat_cap_reached" | "team_access_not_enabled",
    status: TeamSeatStatus,
  ) {
    super(
      code === "team_access_not_enabled"
        ? "Owner's plan does not include team access."
        : `Team is at its seat cap (${status.used} / ${status.cap ?? "∞"}).`,
    );
    this.code = code;
    this.status = status;
  }
}

export async function getSeatUsageForTeam(teamId: string): Promise<TeamSeatStatus> {
  // Owner of the team (via teams.owner_agent_id).
  const { data: team, error: teamErr } = await supabaseAdmin
    .from("teams")
    .select("owner_agent_id, seat_cap_override")
    .eq("id", teamId)
    .maybeSingle();
  if (teamErr || !team) {
    return blocked();
  }

  const ownerAgentId = (team as { owner_agent_id: string }).owner_agent_id;
  // A brokerage contract may allow more seats than the plan lists; an admin
  // sets teams.seat_cap_override and it replaces the plan's cap.
  const capOverride = (team as { seat_cap_override?: number | null }).seat_cap_override ?? null;

  // Owner's auth_user_id, then the active entitlement keyed by user_id.
  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("auth_user_id")
    .eq("id", ownerAgentId)
    .maybeSingle();
  const ownerUserId = (agent as { auth_user_id: string | null } | null)?.auth_user_id ?? null;
  if (!ownerUserId) return blocked();

  const { data: entRow } = await supabaseAdmin
    .from("product_entitlements")
    .select("plan, is_active, team_access")
    .eq("user_id", ownerUserId)
    .eq("product", "leadsmart_agent")
    .eq("is_active", true)
    .maybeSingle();
  const ent = (entRow as Pick<AgentEntitlement, "plan" | "is_active" | "team_access"> | null) ?? null;

  const plan = ent?.plan ?? null;
  const teamAccess = Boolean(ent?.team_access) && plan != null && PLAN_CATALOG[plan].teamAccess;
  const planCap = capOverride != null && capOverride > 0 ? capOverride : plan != null ? PLAN_CATALOG[plan].teamSeatCap : 0;

  // Count members + active invites in parallel.
  const nowIso = new Date().toISOString();
  const [memberRes, inviteRes] = await Promise.all([
    supabaseAdmin
      .from("team_memberships")
      .select("agent_id", { count: "exact", head: true })
      .eq("team_id", teamId),
    supabaseAdmin
      .from("team_invites")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .is("accepted_at", null)
      .gt("expires_at", nowIso),
  ]);

  const memberCount = memberRes.count ?? 0;
  const activeInviteCount = inviteRes.count ?? 0;

  const usage = computeSeatUsage({
    memberCount,
    activeInviteCount,
    cap: teamAccess ? planCap : 0,
  });

  return { ...usage, plan, teamAccess };
}

/**
 * Throw if the team has no room for one more seat. Used at invite
 * time and at accept time (so a token issued before a downgrade
 * still hits the cap when redeemed).
 */
export async function assertCanAddSeatToTeam(teamId: string): Promise<void> {
  const status = await getSeatUsageForTeam(teamId);
  if (!status.teamAccess) {
    throw new TeamSeatError("team_access_not_enabled", status);
  }
  if (status.full) {
    throw new TeamSeatError("team_seat_cap_reached", status);
  }
}

function blocked(): TeamSeatStatus {
  return {
    used: 0,
    cap: 0,
    available: 0,
    full: true,
    plan: null,
    teamAccess: false,
  };
}
