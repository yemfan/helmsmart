/**
 * POST /api/reschedule/[token]
 *
 * Public — no session. The reschedule_token IS the capability: holding it lets
 * you move exactly one appointment and nothing else. It is a random uuid, never
 * an id, and it is looked up only by token, so an attacker gains nothing from
 * knowing an appointment id.
 *
 * Body: { start: ISO }. Conflicts and business hours are re-validated inside
 * rescheduleAppointment, because the link lives in a text message and may be
 * opened days after the day filled up.
 */

import { NextRequest, NextResponse } from "next/server";
import { rescheduleAppointment } from "@/lib/voice-agent/booking";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });

  let start = "";
  try {
    const body = (await request.json()) as { start?: unknown };
    start = typeof body.start === "string" ? body.start : "";
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  if (!start) return NextResponse.json({ ok: false, error: "Missing start time" }, { status: 400 });

  const res = await rescheduleAppointment(token, start);
  if (!res.ok) {
    // 409, not 500: "that time was just taken" and "this link expired" are
    // normal outcomes of a link someone opens later, not server faults. The
    // page shows the reason and leaves the other times tappable.
    return NextResponse.json({ ok: false, error: res.reason }, { status: 409 });
  }
  return NextResponse.json({ ok: true, label: res.label, startISO: res.startISO });
}
