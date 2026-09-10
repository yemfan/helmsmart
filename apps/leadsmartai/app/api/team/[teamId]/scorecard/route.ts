import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { loadScorecard } from "@/lib/teams/scorecard.server";
import { getRole } from "@/lib/teams/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/team/[teamId]/scorecard
 * The office's production by month, the trailing year against the year
 * before, market measures and pipeline. Any member may read it: like the
 * leaderboard, the office's numbers are part of being on the team.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await params;
    if (!teamId) return NextResponse.json({ ok: false, error: "Missing teamId" }, { status: 400 });
    const ctx = await getCurrentAgentContext();
    const role = await getRole({ teamId, agentId: ctx.agentId });
    if (!role) return NextResponse.json({ ok: false, error: "Not a team member" }, { status: 403 });
    const scorecard = await loadScorecard(teamId);
    return NextResponse.json({ ok: true, scorecard });
  } catch (e) {
    console.error("[team/scorecard]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }
}
