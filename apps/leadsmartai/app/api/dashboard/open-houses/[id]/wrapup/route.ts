import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { sendWrapup } from "@/lib/open-houses/wrapup.server";
import type { WrapupAudience } from "@/lib/open-houses/wrapup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/dashboard/open-houses/[id]/wrapup
 * { comment?: string, to: ("owner" | "agent")[] }
 * The host sends the day's report. Recipients come from the open house
 * (owner, requesting agent); the host gets a copy.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { comment?: unknown; to?: unknown };
    const to = (Array.isArray(body.to) ? body.to : []).filter((v): v is WrapupAudience => v === "owner" || v === "agent");
    const comment = typeof body.comment === "string" ? body.comment.slice(0, 2000) : null;
    const result = await sendWrapup({ agentId: String(agentId), openHouseId: id, comment, to });
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : result.error === "no_recipients" ? 400 : 502;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }
    return NextResponse.json({ ok: true, sentTo: result.sentTo, openHouse: result.openHouse });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST open-houses/[id]/wrapup:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
