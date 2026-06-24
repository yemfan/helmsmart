import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/authFromRequest";
import { logEngagementEvent } from "@/lib/contacts/logEngagementEvent";
import { getLeadScoreView } from "@/lib/contacts/leadScore";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }
    const body = (await req.json().catch(() => ({}))) as {
      contact_id?: string | number;
      event_type?: string;
      metadata?: Record<string, any>;
    };
    const leadId = String(body.contact_id ?? "").trim();
    const eventType = String(body.event_type ?? "").trim().toLowerCase();
    if (!leadId || !eventType) {
      return NextResponse.json(
        { ok: false, error: "lead_id and event_type are required" },
        { status: 400 }
      );
    }

    // Logs the event AND refreshes the composite rating, then return the view.
    await logEngagementEvent(leadId, eventType, { source: "api", payload: body.metadata ?? {} });
    const score = await getLeadScoreView(leadId);
    return NextResponse.json({ ok: true, score });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
