import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getListingById } from "@/lib/listings/service";
import { publishListingReel } from "@/lib/listings/adReel";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/dashboard/listings/[id]/ad-reel/publish
 * Queue the finished video ad to the agent's connected FB/IG/LinkedIn accounts
 * (drained by the publish cron). Optional { caption } overrides the AI caption.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;
    const listing = await getListingById(String(agentId), id);
    if (!listing) return NextResponse.json({ ok: false, error: "Listing not found" }, { status: 404 });

    const body = (await req.json().catch(() => ({}))) as { caption?: unknown };
    const caption = typeof body.caption === "string" ? body.caption : undefined;

    const out = await publishListingReel(String(agentId), id, caption);
    if (out.error && out.scheduled === 0) {
      return NextResponse.json({ ok: false, error: out.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, scheduled: out.scheduled });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST /api/dashboard/listings/[id]/ad-reel/publish:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
