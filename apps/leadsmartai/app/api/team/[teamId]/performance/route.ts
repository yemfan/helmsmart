import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { loadTeamPerformance, normalizeDays } from "@/lib/teams/performance.server";
import { getRole } from "@/lib/teams/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/team/[teamId]/performance?days=7|30|90|365
 * Who did what in the window, next to the window before. Like the
 * breakdown, any member may read it: a leaderboard is a transparency
 * surface, and seeing the team is part of being on it.
 */
export async function GET(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await params;
    if (!teamId) return NextResponse.json({ ok: false, error: "Missing teamId" }, { status: 400 });
    const ctx = await getCurrentAgentContext();
    const role = await getRole({ teamId, agentId: ctx.agentId });
    if (!role) return NextResponse.json({ ok: false, error: "Not a team member" }, { status: 403 });
    const days = normalizeDays(new URL(req.url).searchParams.get("days"));
    const performance = await loadTeamPerformance(teamId, days);
    return NextResponse.json({ ok: true, performance });
  } catch (e) {
    console.error("[team/performance]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }
}
