import { NextResponse } from "next/server";
import { extractRequestMeta } from "@/lib/consent/extractRequestMeta";
import { captureHubLead, hubLeadInputFromBody } from "@/lib/marketing-hub/leads";
import { loadHubByUsername } from "@/lib/marketing-hub/loadHub";
import { SESSION_COOKIE, VISITOR_COOKIE, readCookieFromHeader } from "@/lib/marketing-hub/visitor";
import { verifyTurnstile } from "@/lib/marketing-hub/turnstile";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bookAppointment, getAvailability } from "@/lib/voice-agent/booking";

export const runtime = "nodejs";

/**
 * /api/public/hub/[username]/booking — UNAUTHENTICATED.
 *
 * GET  ?date=YYYY-MM-DD  → open slots, from the same engine the AI
 *                          receptionist books with (business hours, existing
 *                          appointments, timezone).
 * POST                   → the visitor becomes a lead, then the slot is booked
 *                          for that contact. The lead comes first: a booking
 *                          that fails validation must still leave the agent a
 *                          person to call back.
 *
 * Only answers when the hub's booking mode resolved to the receptionist
 * engine. External and request modes never reach here.
 */

async function ready(username: string) {
  const hub = await loadHubByUsername(username);
  if (hub.status !== "ready" || hub.agentId === null) return null;
  if (hub.booking.mode !== "receptionist") return null;
  return hub;
}

export async function GET(req: Request, ctx: { params: Promise<{ username: string }> }) {
  try {
    const { username } = await ctx.params;
    const hub = await ready(username);
    if (!hub) return NextResponse.json({ ok: false, error: "booking_unavailable" }, { status: 404 });

    const url = new URL(req.url);
    const date = (url.searchParams.get("date") ?? "").slice(0, 10);
    const availability = await getAvailability(String(hub.agentId), date);
    return NextResponse.json({ ok: true, ...availability });
  } catch (e) {
    console.error("[hub.booking] GET threw:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ username: string }> }) {
  try {
    const { username } = await ctx.params;
    const hub = await ready(username);
    if (!hub || hub.agentId === null) {
      return NextResponse.json({ ok: false, error: "booking_unavailable" }, { status: 404 });
    }
    const agentId = hub.agentId;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const startISO = typeof body.startISO === "string" ? body.startISO.slice(0, 40) : "";
    if (!startISO || Number.isNaN(Date.parse(startISO))) {
      return NextResponse.json({ ok: false, error: "slot_required" }, { status: 400 });
    }

    const meta = extractRequestMeta(req);
    const human = await verifyTurnstile(body.turnstileToken, meta.ipAddress);
    if (!human.ok) {
      return NextResponse.json({ ok: false, error: "verification" }, { status: 403 });
    }

    const input = hubLeadInputFromBody(body, "booking");
    if (!input.intent) input.intent = "consult";
    const cookieHeader = req.headers.get("cookie");
    const lead = await captureHubLead({
      agentId,
      username,
      input,
      cookieHeader,
      requestMeta: meta,
      settings: hub.config.leadCapture,
    });
    if (!lead.ok) {
      const status = lead.error === "save_failed" ? 500 : 400;
      return NextResponse.json({ ok: false, error: lead.error }, { status });
    }

    const booked = await bookAppointment(String(agentId), {
      typeName: "Consultation",
      meetingMode: typeof body.meetingMode === "string" ? body.meetingMode.slice(0, 40) : undefined,
      startISO,
      contactId: lead.contactId,
      callerName: input.name,
      callerPhone: input.phone || null,
    });

    if (!booked.ok) {
      return NextResponse.json({ ok: false, error: "slot_taken", reason: booked.reason ?? null }, { status: 409 });
    }

    // The engine stamps its own source; this appointment came from the hub.
    if (booked.eventId) {
      void supabaseAdmin
        .from("voice_appointments")
        .update({ source: "marketing_hub" } as never)
        .eq("id", booked.eventId as never)
        .eq("agent_id", agentId as never)
        .then(({ error }) => {
          if (error) console.warn("[hub.booking] source:", error.message);
        });
    }

    void supabaseAdmin
      .from("traffic_events")
      .insert({
        event_type: "appointment_booked",
        page_path: `/@${username}/book`,
        agent_id: agentId,
        visitor_id: readCookieFromHeader(cookieHeader, VISITOR_COOKIE),
        session_id: readCookieFromHeader(cookieHeader, SESSION_COOKIE),
        contact_id: lead.contactId,
        metadata: { kind: "hub_event", eventId: booked.eventId ?? null },
      } as never)
      .then(({ error }) => {
        if (error) console.warn("[hub.booking] event:", error.message);
      });

    return NextResponse.json({
      ok: true,
      startISO: booked.startISO ?? startISO,
      label: booked.label ?? null,
    });
  } catch (e) {
    console.error("[hub.booking] POST threw:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
