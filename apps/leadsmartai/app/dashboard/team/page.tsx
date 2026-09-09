import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getTeamAccessStatus } from "@/lib/teams/access.server";
import { getSeatUsageForTeam } from "@/lib/teams/seatLimits.server";
import { getRoster, listTeamsForAgent } from "@/lib/teams/service";
import { getOnboardingBoard, type OnboardingBoard } from "@/lib/teams/onboarding.server";
import { loadTeamBrand } from "@/lib/teams/brand.server";
import { canManageTeam } from "@/lib/teams/roles";
import { loadMemberDirectory, type MemberDirectory } from "@/lib/teams/directory.server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { TeamBrand } from "@/lib/teams/brand";
import { TeamDashboard } from "@/components/team/TeamDashboard";
import type { TeamRoster } from "@/lib/teams/types";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.team.metaTitle", { ns: "dashboard" }),
    description: t("pages.team.metaDescription", { ns: "dashboard" }),
    robots: { index: false },
  };
}

/**
 * Team management page. Server component:
 *   - Resolves the calling agent + their team-access status
 *   - When they have a team: loads roster + seat usage
 *   - Hands everything to the client component
 *
 * MVP scope: one team per agent on this page. Multi-team support is
 * a follow-up — when an agent owns several teams, the page would
 * pick a primary and add a switcher.
 */
export default async function TeamPage() {
  const ctx = await getCurrentAgentContext();
  const [teams, access] = await Promise.all([
    listTeamsForAgent(ctx.agentId),
    getTeamAccessStatus(ctx.agentId),
  ]);

  let roster: TeamRoster | null = null;
  let isOwner = false;
  let canManage = false;
  let seatUsage: { used: number; cap: number | null; full: boolean } | null = null;
  let board: OnboardingBoard | null = null;
  let brand: TeamBrand | null = null;
  let pooledCredits = false;
  let directory: MemberDirectory = {};

  if (teams.length > 0) {
    const team = teams[0];
    isOwner = team.ownerAgentId === ctx.agentId;
    const r = await getRoster(team.id);
    const myRole = isOwner ? "owner" : (r?.members.find((m) => m.agentId === ctx.agentId)?.role ?? null);
    canManage = canManageTeam(myRole);
    const [seat, dir, b, br, pooledRow] = await Promise.all([
      getSeatUsageForTeam(team.id),
      loadMemberDirectory(team.id),
      canManage ? getOnboardingBoard(team.id).catch(() => null) : Promise.resolve(null),
      canManage ? loadTeamBrand(team.id).catch(() => null) : Promise.resolve(null),
      isOwner ? supabaseAdmin.from("teams").select("pooled_credits").eq("id", team.id).maybeSingle().then((r) => (r.data as { pooled_credits?: boolean } | null)?.pooled_credits ?? false) : Promise.resolve(false),
    ]);
    pooledCredits = Boolean(pooledRow);
    directory = dir;
    roster = r;
    seatUsage = { used: seat.used, cap: seat.cap, full: seat.full };
    board = b;
    brand = br;
  }

  return (
    <TeamDashboard
      currentAgentId={ctx.agentId}
      isOwner={isOwner}
      canManage={canManage}
      roster={roster}
      access={access}
      seatUsage={seatUsage}
      board={board}
      brand={brand}
      pooledCredits={pooledCredits}
      directory={directory}
    />
  );
}
