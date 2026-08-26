import "server-only";

import { sendSMS } from "@/lib/twilioSms";
import { loadReceptionistContext } from "@/lib/voice-agent/context";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { missedCallTextBack } from "@/lib/voice-agent/callerTextBackCopy";

/**
 * Text a caller who hung up without saying anything.
 *
 * "Only on a missed call" was the rule, and until now that meant only the
 * out-of-minutes branch — which is off — so no caller ever got a text. But a
 * caller who rings, hears the greeting and hangs up before speaking has missed
 * us just as surely as one who never got through: the receptionist technically
 * answered, and nobody learned anything. That is exactly the person worth
 * texting back.
 *
 * The test is whether the CALLER said anything, not how long the call lasted.
 * A caller who sits silent for a minute is still silent, and a short call where
 * they did speak already produces a summary and a real follow-up.
 *
 * Best-effort; never throws.
 */
export async function sendMissedCallTextBack(input: {
  agentId: string;
  /** The caller's number, in any format. */
  toPhone: string;
}): Promise<void> {
  try {
    const digits = (input.toPhone || "").replace(/\D/g, "");
    if (digits.length !== 10 && digits.length !== 11) return;
    const to = digits.length === 10 ? `+1${digits}` : `+${digits}`;

    const ctx = await loadReceptionistContext(input.agentId);
    if (!ctx?.orgName) return;

    await sendSMS(to, missedCallTextBack(ctx.orgName, ctx.agentName));
  } catch (e) {
    console.error("sendMissedCallTextBack failed", e);
  }
}

/**
 * Did this caller book something during the call that just ended?
 *
 * If so they already have a confirmation text, and following it with "we'll
 * follow up shortly" reads as though the booking didn't take. Someone who books
 * and then hangs up while the receptionist is still saying goodbye is the common
 * case here, and it should not produce two texts a minute apart.
 */
export async function bookedDuringCall(
  agentId: string,
  callerPhone: string,
  callStartedAtISO: string,
): Promise<boolean> {
  try {
    const digits = (callerPhone || "").replace(/\D/g, "").slice(-10);
    if (!digits) return false;
    const { data } = await supabaseAdmin
      .from("voice_appointments")
      .select("caller_phone")
      .eq("agent_id", agentId as never)
      .gte("created_at", callStartedAtISO)
      .limit(20);
    return ((data ?? []) as { caller_phone: string | null }[]).some(
      (r) => (r.caller_phone || "").replace(/\D/g, "").slice(-10) === digits,
    );
  } catch {
    return false;
  }
}
