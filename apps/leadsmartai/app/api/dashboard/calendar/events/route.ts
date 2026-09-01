import { NextResponse } from "next/server";
import { createMobileCalendarEvent, listMobileCalendarEvents } from "@/lib/mobile/calendarMobile";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { syncEventToGoogle } from "@/lib/google-calendar/sync";
import type { MobileCalendarProvider } from "@leadsmart/shared";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const url = new URL(req.url);
    const fromIso = url.searchParams.get("from")?.trim() || undefined;
    const toIso = url.searchParams.get("to")?.trim() || undefined;
    const leadId = url.searchParams.get("leadId")?.trim() || undefined;

    const events = await listMobileCalendarEvents({
      agentId,
      fromIso,
      toIso,
      leadId,
    });

    return NextResponse.json({ ok: true, events });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("dashboard calendar events GET", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

type PostBody = {
  leadId?: string;
  title?: string;
  description?: string | null;
  startsAt?: string;
  endsAt?: string | null;
  timezone?: string | null;
  calendarProvider?: MobileCalendarProvider | null;
};

export async function POST(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const body = (await req.json().catch(() => ({}))) as PostBody;
    const leadId = String(body.leadId ?? "").trim();
    const title = String(body.title ?? "").trim();
    const startsAt = String(body.startsAt ?? "").trim();
    // leadId is OPTIONAL. The dashboard's contact picker defaults to "No
    // contact", and contact_id is nullable, so an appointment with nobody
    // attached is a normal thing to book — it used to 400 here, which the UI
    // then showed as a bare "Failed to add."
    if (!title) {
      return NextResponse.json({ ok: false, error: "title is required" }, { status: 400 });
    }
    if (!startsAt) {
      return NextResponse.json({ ok: false, error: "startsAt is required" }, { status: 400 });
    }

    const event = await createMobileCalendarEvent({
      agentId,
      leadId: leadId || null,
      title,
      description: body.description,
      startsAt,
      endsAt: body.endsAt,
      timezone: body.timezone,
      calendarProvider: body.calendarProvider ?? "local",
    });

    // Sync to Google Calendar. Awaited rather than detached: once the response
    // is sent the function can freeze before a floating promise runs, so
    // fire-and-forget made syncing a coin flip. Wrapped so a Google-side
    // problem never fails the booking itself — the event is already saved.
    if (event?.id) {
      const defaultEnd = new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString();
      try {
        await syncEventToGoogle({
          agentId,
          eventId: event.id,
          title,
          description: body.description ?? undefined,
          startAt: startsAt,
          endAt: body.endsAt ?? defaultEnd,
          timezone: body.timezone ?? undefined,
        });
      } catch (e) {
        console.error("Google Calendar sync (non-fatal):", e);
      }
    }

    return NextResponse.json({ ok: true, event });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    if (msg === "NOT_FOUND") {
      return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });
    }
    console.error("dashboard calendar events POST", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
