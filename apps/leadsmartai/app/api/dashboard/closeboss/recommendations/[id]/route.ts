import { NextResponse } from "next/server";
import { getAgentContextFromRequest } from "@/lib/dashboardService";
import { setBossRecommendationStatus } from "@/lib/closeboss/recommendations";

export const runtime = "nodejs";

/**
 * PATCH /api/dashboard/closeboss/recommendations/[id]
 * Body: { status: "accepted" | "dismissed" | "completed" }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { agentId } = await getAgentContextFromRequest(req);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { status?: string };
    if (body.status !== "accepted" && body.status !== "dismissed" && body.status !== "completed") {
      return NextResponse.json({ ok: false, error: "Invalid status." }, { status: 400 });
    }
    const found = await setBossRecommendationStatus(agentId, id, body.status);
    if (!found) {
      return NextResponse.json({ ok: false, error: "Recommendation not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("PATCH /api/dashboard/closeboss/recommendations/[id]:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
