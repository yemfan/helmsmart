/**
 * Retell custom-function endpoint — POST /api/retell/function
 *
 * Retell calls this when the agent invokes check_availability, book_appointment,
 * or create_callback. Request body: { name, call, args }. We run the shared tool
 * and return { result } (Retell stringifies it for the LLM). Booking side-effects
 * (mark the session, notify the owner, text the caller) run in after() so the
 * agent is never kept waiting.
 *
 * Gate (when RETELL_FUNCTION_SECRET is set) — either form works, so configure
 * whichever Retell's custom-function UI makes easier:
 *   ?k=<RETELL_FUNCTION_SECRET>                  on the function URL, or
 *   Authorization: Bearer <RETELL_FUNCTION_SECRET>  as a custom header.
 *
 * This gate was documented but never written: the route accepted anonymous POSTs
 * and identified the tenant purely from `to_number`, so anyone who knew a
 * business's phone number could book into its calendar, raise tasks against it,
 * and make it send confirmation texts. /api/retell/inbound has always been gated;
 * this is the endpoint with the side effects.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runReceptionistTool, notifyBooking, findOrgIdByNumber } from "@/lib/receptionist-agent";

/** True when the request carries the shared secret, or none is configured. */
function authorized(req: NextRequest): boolean {
  const secret = process.env.RETELL_FUNCTION_SECRET;
  if (!secret) return true;
  if (req.nextUrl.searchParams.get("k") === secret) return true;
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ result: "Unauthorized." }, { status: 401 });
  }

  let name = "";
  let args: Record<string, unknown> = {};
  let call: Record<string, unknown> = {};
  try {
    const body = await req.json();
    name = String(body?.name ?? "");
    args = (body?.args ?? {}) as Record<string, unknown>;
    call = (body?.call ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ result: "Bad request." }, { status: 400 });
  }

  const fromNumber = String(call.from_number ?? "");
  const toNumber = String(call.to_number ?? "");
  const callId = String(call.call_id ?? "");
  const dynVars = (call.retell_llm_dynamic_variables ?? {}) as Record<string, string>;

  const db = await createServiceClient();
  const orgId = dynVars.org_id || (await findOrgIdByNumber(db, toNumber));
  if (!orgId) {
    return NextResponse.json({ result: "I can't reach the booking system right now — please take a message instead." });
  }

  const out = await runReceptionistTool(name, args, { db, orgId, fromNumber });

  if (out.bookedEventId) {
    const orgName = dynVars.business_name || "your appointment";
    after(async () => {
      if (callId) {
        // Surface the booking on the call log (badge + stats). Omit status so a
        // later call_ended/analyzed webhook can still flip it to "completed".
        await db.from("voice_sessions").upsert(
          {
            organization_id: orgId,
            call_sid: callId,
            from_number: fromNumber || "unknown",
            to_number: toNumber || "unknown",
            booked_event_id: out.bookedEventId,
          },
          { onConflict: "call_sid" }
        );
      }
      await notifyBooking(db, { orgId, orgName, twilioNumber: toNumber || null }, fromNumber, {
        bookedNote: out.bookedNote,
        bookedLabel: out.bookedLabel,
        rescheduleToken: out.bookedRescheduleToken,
      });
    });
  }

  return NextResponse.json({ result: out.text });
}
