import "server-only";

import { sendSMS } from "@/lib/twilioSms";
import { loadReceptionistContext } from "@/lib/voice-agent/context";
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
