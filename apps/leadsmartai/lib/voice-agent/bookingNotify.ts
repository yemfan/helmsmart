import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail, EMAIL_BRAND } from "@/lib/email";
import { logAssistantActivity } from "@/lib/closeboss/activities";

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://www.closebossai.com").replace(/\/$/, "");
}

/**
 * Tell the Realtor, immediately, that the receptionist just booked someone in.
 *
 * This fires from the booking itself rather than from the post-call webhook,
 * and that is the whole point. A caller booked a listing consultation for 4pm
 * the same afternoon; the agent's Retell `webhook_url` happened to be unset, so
 * `call_analyzed` never ran, nothing was written, and nobody found out until
 * the caller rang back asking why no one had been in touch. An appointment
 * three hours out cannot depend on a webhook firing after the call ends.
 *
 * Email, not SMS, on purpose: the toll-free is TWILIO_REJECTED pending
 * verification, so every outbound text — to the caller AND to the agent —
 * currently fails. Email goes through Resend on a verified domain and works
 * today. Wire the text in alongside this once verification passes.
 *
 * Best-effort throughout. A booking that succeeded must never be reported to
 * the caller as failed because we could not send mail about it.
 */
export async function notifyAgentOfBooking(input: {
  agentId: string;
  /** Spoken label from the booking engine, e.g. "Tuesday, August 25 at 4 PM". */
  label: string;
  /** Appointment title, e.g. "listing consultation — 吉米". */
  title?: string | null;
  callerName?: string | null;
  callerPhone?: string | null;
  contactId?: string | null;
}): Promise<void> {
  const who = input.callerName?.trim() || input.callerPhone?.trim() || "A caller";

  // The activity feed first: it is in-app, needs no third party, and is the
  // record that survives if mail is down.
  await logAssistantActivity({
    agentId: input.agentId,
    assistantType: "receptionist",
    activityType: "appointment_booked",
    summary: `Booked ${who} for ${input.label}`,
    outcome: input.title || null,
    priority: "high",
    requiresAttention: true,
    relatedEntityType: input.contactId ? "contact" : null,
    relatedEntityId: input.contactId ?? null,
  });

  try {
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("auth_user_id")
      .eq("id", input.agentId as never)
      .maybeSingle();
    const userId = (agent as { auth_user_id?: string | null } | null)?.auth_user_id;
    if (!userId) return;

    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = userData?.user?.email;
    if (!email) return;

    const phoneLine = input.callerPhone?.trim() ? `\nPhone: ${input.callerPhone.trim()}` : "";
    const whatLine = input.title?.trim() ? `\nWhat: ${input.title.trim()}` : "";

    await sendEmail({
      to: email,
      subject: `New appointment: ${who} — ${input.label}`,
      text: `Your AI receptionist just booked an appointment.

When: ${input.label}
Who: ${who}${phoneLine}${whatLine}

The caller was told to expect this, so it is worth confirming with them directly.

See it in your calendar:
${siteBase()}/dashboard/calendar

— ${EMAIL_BRAND}`,
    });
  } catch (e) {
    console.error("notifyAgentOfBooking: could not email the agent", e);
  }
}
