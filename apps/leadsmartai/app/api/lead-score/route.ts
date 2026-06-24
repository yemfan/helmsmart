import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/authFromRequest";
import { recomputeLeadRating } from "@/lib/contacts/recomputeLeadRating";
import { getLeadScoreView } from "@/lib/contacts/leadScore";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const url = new URL(req.url);
    const leadId = String(url.searchParams.get("contact_id") ?? "").trim();
    const force = String(url.searchParams.get("refresh") ?? "false").toLowerCase() === "true";
    if (!leadId) {
      return NextResponse.json({ ok: false, error: "lead_id is required" }, { status: 400 });
    }

    if (force) await recomputeLeadRating(leadId);
    const res = await getLeadScoreView(leadId);
    return NextResponse.json({
      ok: true,
      lead_score: res.lead_score,
      rating: res.rating,
      intent: res.intent,
      intent_level: res.intent_level,
      timeline: res.timeline,
      confidence: res.confidence,
      explanation: res.explanation,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
