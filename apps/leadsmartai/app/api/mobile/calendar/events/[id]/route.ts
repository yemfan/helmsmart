import { NextResponse } from "next/server";
import {
  patchMobileCalendarEvent,
  VOICE_BOOKING_READ_ONLY,
  VOICE_BOOKING_READ_ONLY_MESSAGE,
} from "@/lib/mobile/calendarMobile";
import { requireMobileAgent } from "@/lib/mobile/auth";
import type { MobileCalendarEventStatus } from "@leadsmart/shared";

export const runtime = "nodejs";

type PatchBody = {
  status?: MobileCalendarEventStatus;
  title?: string;
  description?: string | null;
  starts_at?: string;
  ends_at?: string | null;
};

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileAgent(req);
  if (auth.ok === false) return auth.response;

  try {
    const { id } = await ctx.params;
    const eventId = String(id ?? "").trim();
    if (!eventId) {
      return NextResponse.json({ ok: false, success: false, error: "Missing event id" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as PatchBody;
    const event = await patchMobileCalendarEvent({
      agentId: auth.ctx.agentId,
      eventId,
      status: body.status,
      title: body.title,
      description: body.description,
      startsAt: body.starts_at,
      endsAt: body.ends_at,
    });

    return NextResponse.json({ ok: true, success: true, event });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    if (msg === "NOT_FOUND") {
      return NextResponse.json({ ok: false, success: false, error: "Event not found" }, { status: 404 });
    }
    if (msg === VOICE_BOOKING_READ_ONLY) {
      return NextResponse.json(
        { ok: false, success: false, error: VOICE_BOOKING_READ_ONLY_MESSAGE },
        { status: 400 },
      );
    }
    console.error("PATCH /api/mobile/calendar/events/[id]", e);
    return NextResponse.json({ ok: false, success: false, error: msg }, { status: 500 });
  }
}
