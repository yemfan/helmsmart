import { NextRequest, NextResponse, after } from "next/server";
import { resolveAgentIdByReceptionistNumber } from "@/lib/voice-receptionist/settings";
import { notifyAgentOfBooking } from "@/lib/voice-agent/bookingNotify";
import { confirmBookingToCaller } from "@/lib/voice-agent/bookingConfirmSms";
import { runReceptionistTool } from "@/lib/voice-agent/booking";

export const runtime = "nodejs";

/**
 * Retell custom-function endpoint (LeadSmart) — POST /api/retell/function
 *
 * Retell calls this when the receptionist invokes check_availability,
 * book_appointment, or create_callback. Body: { name, args, call }. We resolve
 * the agent (from the org_id dynamic variable, else the dialed number), run the
 * shared booking tool, and return { result } (Retell shows it to the LLM).
 *
 * Gate with ?k=<RETELL_FUNCTION_SECRET>, same as the other Retell webhooks —
 * configure each custom function's URL with that query param.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.RETELL_FUNCTION_SECRET;
  if (secret && req.nextUrl.searchParams.get("k") !== secret) {
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
  const dynVars = (call.retell_llm_dynamic_variables ?? {}) as Record<string, string>;

  const agentId = dynVars.org_id || (await resolveAgentIdByReceptionistNumber(toNumber));
  if (!agentId) {
    return NextResponse.json({
      result: "I can't reach the booking system right now — please take a message instead.",
    });
  }

  try {
    const out = await runReceptionistTool(name, args, { agentId, fromPhone: fromNumber });
    // A booking is the one outcome the Realtor has to know about straight away —
    // the appointment can be hours from now. `after` so the caller isn't left
    // waiting on an email round-trip mid-sentence.
    if (out.bookedEventId && out.bookedLabel) {
      const label = out.bookedLabel;
      const title = out.bookedNote ?? null;
      const contactId = out.bookedContactId ?? null;
      const callerName = out.bookedCallerName ?? null;
      const startISO = out.bookedStartISO ?? "";
      after(async () => {
        // Independent of each other on purpose: a Twilio outage must not cost
        // the Realtor their alert, and a mail failure must not cost the caller
        // their confirmation.
        await Promise.allSettled([
          notifyAgentOfBooking({
            agentId,
            label,
            title,
            callerName,
            callerPhone: fromNumber,
            contactId,
          }),
          confirmBookingToCaller({
            agentId,
            toPhone: fromNumber,
            startISO,
            label,
            contactId,
            rescheduleToken: out.bookedRescheduleToken,
          }),
        ]);
      });
    }
    return NextResponse.json({ result: out.text });
  } catch (e) {
    console.error("retell/function", e);
    return NextResponse.json({ result: "Something went wrong — take a message instead." });
  }
}
