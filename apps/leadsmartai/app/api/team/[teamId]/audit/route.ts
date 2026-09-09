import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { loadLatestAudit, normalizeAuditDays, runTeamAudit } from "@/lib/teams/audit.server";
import { canManageTeam } from "@/lib/teams/roles";
import { getRole } from "@/lib/teams/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET  /api/team/[teamId]/audit            the last audit run, or null
 * POST /api/team/[teamId]/audit?days=7|30|90   run one now and store it
 * Owner and managers only: the audit names agents and quotes their ads.
 */
async function gate(teamId: string) {
  const ctx = await getCurrentAgentContext();
  const role = await getRole({ teamId, agentId: ctx.agentId });
  return canManageTeam(role) ? ctx : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await params;
    if (!teamId) return NextResponse.json({ ok: false, error: "Missing teamId" }, { status: 400 });
    if (!(await gate(teamId))) return NextResponse.json({ ok: false, error: "Not a team manager" }, { status: 403 });
    const audit = await loadLatestAudit(teamId);
    return NextResponse.json({ ok: true, audit });
  } catch (e) {
    console.error("[team/audit GET]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await params;
    if (!teamId) return NextResponse.json({ ok: false, error: "Missing teamId" }, { status: 400 });
    const ctx = await gate(teamId);
    if (!ctx) return NextResponse.json({ ok: false, error: "Not a team manager" }, { status: 403 });
    const days = normalizeAuditDays(new URL(req.url).searchParams.get("days"));
    const audit = await runTeamAudit({ teamId, days, byAgentId: ctx.agentId });
    return NextResponse.json({ ok: true, audit });
  } catch (e) {
    console.error("[team/audit POST]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "run_failed" }, { status: 500 });
  }
}
