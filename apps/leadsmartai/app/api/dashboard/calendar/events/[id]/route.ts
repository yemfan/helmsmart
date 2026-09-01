import { NextResponse } from "next/server";
import { patchMobileCalendarEvent } from "@/lib/mobile/calendarMobile";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { deleteGoogleEvent, syncEventToGoogle } from "@/lib/google-calendar/sync";
import type { MobileCalendarEventStatus } from "@leadsmart/shared";

export const runtime = "nodejs";

type PatchBody = {
  status?: MobileCalendarEventStatus;
  title?: string;
  description?: string | null;
  startsAt?: string;
  endsAt?: string | null;
};

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;
    const eventId = String(id ?? "").trim();
    if (!eventId) {
      return NextResponse.json({ ok: false, error: "Missing event id" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as PatchBody;
    const event = await patchMobileCalendarEvent({
      agentId,
      eventId,
      status: body.status,
      title: body.title,
      description: body.description,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
    });

    // Propagate the change to Google Calendar. Only create used to sync, so
    // cancelling an appointment removed it from CloseBoss and left it sitting
    // in the agent's Google Calendar forever, and a reschedule moved it in one
    // place only — while the banner promised the two stay in step.
    //
    // Awaited, not fire-and-forget: the response returning can freeze the
    // function before a detached promise runs, which makes syncing a coin
    // flip. Wrapped so a Google-side problem never fails the edit itself.
    const touchesGoogle =
      body.title !== undefined ||
      body.description !== undefined ||
      body.startsAt !== undefined ||
      body.endsAt !== undefined;
    try {
      if (event.status === "cancelled") {
        if (event.external_event_id) {
          await deleteGoogleEvent({ agentId, googleEventId: event.external_event_id });
        }
      } else if (touchesGoogle) {
        // syncEventToGoogle upserts: it PUTs when the row already carries an
        // external_event_id and POSTs otherwise, then persists the id back. So
        // editing an event that never synced (created while the Calendar API
        // was switched off, say) quietly repairs it.
        const defaultEnd = new Date(
          new Date(event.starts_at).getTime() + 60 * 60 * 1000,
        ).toISOString();
        await syncEventToGoogle({
          agentId,
          eventId: event.id,
          title: event.title,
          description: event.description ?? undefined,
          startAt: event.starts_at,
          endAt: event.ends_at ?? defaultEnd,
          timezone: event.timezone ?? undefined,
        });
      }
    } catch (e) {
      console.error("Google Calendar sync on patch (non-fatal):", e);
    }

    return NextResponse.json({ ok: true, event });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    if (msg === "NOT_FOUND") {
      return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
    }
    console.error("dashboard calendar events PATCH", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
