import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { loadTeamMarketing, normalizeMarketingDays } from "@/lib/teams/marketing.server";
import { canManageTeam } from "@/lib/teams/roles";
import { getRole } from "@/lib/teams/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/team/[teamId]/marketing?days=7|30|90
 * Who is set up to market and what it is producing. Unlike performance this
 * is a coaching surface — which agents have no hub, no networks, nothing
 * queued — so it reads for the owner and managers only.
 */
export async function GET(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await params;
    if (!teamId) return NextResponse.json({ ok: false, error: "Missing teamId" }, { status: 400 });
    const ctx = await getCurrentAgentContext();
    const role = await getRole({ teamId, agentId: ctx.agentId });
    if (!canManageTeam(role)) return NextResponse.json({ ok: false, error: "Not a team manager" }, { status: 403 });
    const days = normalizeMarketingDays(new URL(req.url).searchParams.get("days"));
    const marketing = await loadTeamMarketing(teamId, days);
    return NextResponse.json({ ok: true, marketing });
  } catch (e) {
    console.error("[team/marketing]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }
}
