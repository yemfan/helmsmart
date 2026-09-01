import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSMS } from "@/lib/twilioSms";
import { getReceptionistConfig } from "@/lib/voice-receptionist/settings";

/**
 * Text the caller their appointment details, right after it is booked.
 *
 * A caller booked a listing consultation for the same afternoon, was told "see
 * you at four", and got nothing in writing — then rang back asking why. The
 * receptionist had done her job; there was simply no confirmation to send,
 * because `book_appointment` returned the details and nobody consumed them.
 *
 * Sent in the contact's own language. The English `bookedLabel` is deliberately
 * NOT reused for a Chinese-speaking caller — the start time is re-rendered from
 * the ISO timestamp instead, in the agent's timezone, so "Friday, September 4 at
 * 3:30 PM" becomes "9月4日星期五 下午3:30".
 *
 * Best-effort. A booking that succeeded must never surface to the caller as
 * failed because a text didn't go out; the appointment is already in the
 * calendar and the Realtor is alerted separately.
 */
export async function confirmBookingToCaller(input: {
  agentId: string;
  /** The number the caller phoned from. */
  toPhone: string;
  startISO: string;
  /** Fallback label if the timestamp can't be re-rendered. */
  label: string;
  contactId?: string | null;
}): Promise<void> {
  try {
    const digits = (input.toPhone || "").replace(/\D/g, "");
    if (digits.length !== 10 && digits.length !== 11) return;
    const to = digits.length === 10 ? `+1${digits}` : `+${digits}`;

    let language = "";
    if (input.contactId) {
      const { data } = await supabaseAdmin
        .from("contacts")
        .select("preferred_language")
        .eq("id", input.contactId as never)
        .maybeSingle();
      language = ((data as { preferred_language?: string | null } | null)?.preferred_language ?? "")
        .toLowerCase();
    }

    const [{ timezone }, { data: agent }] = await Promise.all([
      getReceptionistConfig(input.agentId),
      supabaseAdmin
        .from("agents")
        .select("brand_name")
        .eq("id", input.agentId as never)
        .maybeSingle(),
    ]);
    const brand = (agent as { brand_name?: string | null } | null)?.brand_name?.trim() || "";

    const zh = language.startsWith("zh");
    let when = input.label;
    const start = new Date(input.startISO);
    if (!Number.isNaN(start.getTime())) {
      when = new Intl.DateTimeFormat(zh ? "zh-CN" : "en-US", {
        timeZone: timezone || "America/Los_Angeles",
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        // zh-CN defaults to a 24-hour clock and, with a numeric month, renders
        // "9/4星期五 15:30" — which reads like a date fragment, not a time you
        // would say. Forcing hour12 and a long month gives "9月4日星期五 下午3:30".
        hour12: true,
      }).format(start);
    }

    // Opt-out language on every message: the caller phoned us, so this is
    // solicited, but it is still an automated text.
    const message = zh
      ? `${brand ? `${brand}：` : ""}您的预约已确认，时间是${when}。如需改期请回电。回复 STOP 退订。`
      : `Your appointment with ${brand || "us"} is confirmed for ${when}. Call us back if you need to change it. Reply STOP to opt out.`;

    await sendSMS(to, message, input.contactId ?? undefined);
  } catch (e) {
    console.error("confirmBookingToCaller: could not text the caller", e);
  }
}
