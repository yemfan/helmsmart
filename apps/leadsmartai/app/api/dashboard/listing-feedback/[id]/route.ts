import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import {
  deleteListingFeedback,
  sendFeedbackRequest,
} from "@/lib/listing-feedback/service";

export const runtime = "nodejs";

/**
 * DELETE /api/dashboard/listing-feedback/[id]
 *   Remove a feedback row (typo, wrong buyer, etc.).
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;
    const ok = await deleteListingFeedback(String(agentId), id);
    if (!ok) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("DELETE listing-feedback/[id]:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/dashboard/listing-feedback/[id]/send
 *   Send (or re-send) the feedback-request email. Stamps
 *   request_email_sent_at on success.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;
    const appBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://www.realtybossai.com";
    const result = await sendFeedbackRequest(String(agentId), id, appBaseUrl);
    if (!result.sent) {
      return NextResponse.json({ ok: false, error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST listing-feedback/[id]:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
