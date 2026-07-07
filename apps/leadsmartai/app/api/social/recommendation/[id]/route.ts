import { NextResponse } from "next/server";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { updateRecommendationStatus } from "@/lib/social/recommend";

export const runtime = "nodejs";

const ALLOWED = new Set(["approved", "dismissed", "copied", "suggested"]);

/**
 * POST /api/social/recommendation/[id] { status } — approve / dismiss / mark
 * copied a single social recommendation. Agent-scoped: the update is constrained
 * to rows the current agent owns.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { status?: unknown };
    const status = typeof body.status === "string" ? body.status : "";
    if (!ALLOWED.has(status)) {
      return NextResponse.json(
        { ok: false, error: "status must be one of: approved, dismissed, copied, suggested" },
        { status: 400 },
      );
    }
    const updated = await updateRecommendationStatus(
      String(agentId),
      id,
      status as "approved" | "dismissed" | "copied" | "suggested",
    );
    if (!updated) {
      return NextResponse.json(
        { ok: false, error: "Recommendation not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
