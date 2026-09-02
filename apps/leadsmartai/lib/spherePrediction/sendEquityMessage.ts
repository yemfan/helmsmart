import "server-only";

import { sendEmail } from "@/lib/email";
import { logEmailMessage } from "@/lib/ai-email/lead-resolution";
import { appendMessages, getOrCreateConversation } from "@/lib/leadConversationHelpers";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendSMS } from "@/lib/twilioSms";

import {
  checkEquitySendReadiness,
  isEquitySendCheckFailure,
  type EquitySendChannel,
  type EquitySendCheckFailure,
  type EquitySendContactView,
} from "@/lib/spherePrediction/equitySendCheck";

/**
 * Server-side orchestrator for sending an SOI equity-update message.
 *
 * Pipeline:
 *   1. Ownership-scoped contact fetch (agent_id + contact_id)
 *   2. Pure consent / channel-readiness check (lib/spherePrediction/equitySendCheck)
 *   3. Send via Twilio (SMS) or Resend (email)
 *   4. Append to lead_conversations so the AI follow-up cron has context
 *   5. Write contact_events audit row + bump contacts.last_contacted_at
 *
 * Steps 4–5 are best-effort — if Twilio / Resend succeeds but a follow-up
 * write fails, we DO NOT roll back the send (the message is already in the
 * consumer's hands). Failures are logged so the agent can hand-fix the
 * timeline if needed.
 */

const PHONE_DIGITS_RE = /\D/g;

function toE164(phone: string): string | null {
  const d = phone.replace(PHONE_DIGITS_RE, "").slice(-10);
  return d.length === 10 ? `+1${d}` : null;
}

export type SendEquityArgs = {
  agentId: string;
  contactId: string;
  channel: EquitySendChannel;
  /** SMS body when channel === "sms"; email body when channel === "email". */
  body: string;
  /** Required for email. */
  emailSubject?: string;
};

export type SendEquitySuccess = { ok: true; channel: EquitySendChannel; sentAt: string };
export type SendEquityFailure = {
  ok: false;
  code:
    | EquitySendCheckFailure["code"]
    | "contact_not_found"
    | "send_failed"
    | "channel_not_configured";
  reason: string;
};
export type SendEquityResult = SendEquitySuccess | SendEquityFailure;

export function isSendEquityFailure(r: SendEquityResult): r is SendEquityFailure {
  return r.ok === false;
}

type ContactRow = {
  id: string;
  lifecycle_stage: string;
  email: string | null;
  phone: string | null;
  sms_opt_in: boolean | null;
  tcpa_consent_at: string | null;
  do_not_contact_sms: boolean | null;
  do_not_contact_email: boolean | null;
  automation_disabled: boolean | null;
};

function mapContactToView(row: ContactRow): EquitySendContactView {
  return {
    id: row.id,
    lifecycleStage: row.lifecycle_stage,
    email: row.email,
    phone: row.phone,
    smsOptIn: row.sms_opt_in,
    tcpaConsentAt: row.tcpa_consent_at,
    doNotContactSms: row.do_not_contact_sms,
    doNotContactEmail: row.do_not_contact_email,
    automationDisabled: row.automation_disabled,
  };
}

export async function sendEquityMessage(args: SendEquityArgs): Promise<SendEquityResult> {
  const { agentId, contactId, channel, body, emailSubject } = args;

  // Step 1: ownership-scoped fetch.
  const { data: contactRow } = await supabaseServer
    .from("contacts")
    .select(
      "id,lifecycle_stage,email,phone,sms_opt_in,tcpa_consent_at,do_not_contact_sms,do_not_contact_email,automation_disabled",
    )
    .eq("agent_id", agentId)
    .eq("id", contactId)
    .maybeSingle();

  if (!contactRow) {
    return { ok: false, code: "contact_not_found", reason: "Contact not found for this agent." };
  }

  const view = mapContactToView(contactRow as unknown as ContactRow);

  // Step 2: pure gate.
  const check = checkEquitySendReadiness({ contact: view, channel, body, emailSubject });
  if (isEquitySendCheckFailure(check)) {
    // Bridge the narrower EquitySendCheckFailure into the wider SendEquityFailure.
    return { ok: false, code: check.code, reason: check.reason };
  }

  // Step 3: send.
  const sentAt = new Date().toISOString();
  if (channel === "sms") {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER;
    if (!accountSid || !authToken || !fromNumber) {
      return {
        ok: false,
        code: "channel_not_configured",
        reason: "Twilio is not configured in this environment.",
      };
    }
    const to = toE164(view.phone ?? "");
    if (!to) {
      // The consent gate should have caught this, but defense-in-depth.
      return { ok: false, code: "no_phone", reason: "Phone is not a valid 10-digit US number." };
    }
    try {
      await sendSMS(to, body, contactId);
    } catch (e) {
      const reason = e instanceof Error ? e.message : "send_error";
      return { ok: false, code: "send_failed", reason };
    }
  } else {
    if (!process.env.RESEND_API_KEY) {
      return {
        ok: false,
        code: "channel_not_configured",
        reason: "Resend (email) is not configured in this environment.",
      };
    }
    try {
      const sent = await sendEmail({
        to: view.email ?? "",
        subject: emailSubject ?? "",
        text: body,
      });

      // Thread it into the Inbox, which reads `email_messages`. The timeline
      // append below records it on the Boss conversation, which is a different
      // surface — without this the message was absent from the contact's email
      // thread entirely.
      try {
        await logEmailMessage({
          leadId: contactId,
          direction: "outbound",
          subject: emailSubject ?? "",
          body,
          agentId: agentId ? String(agentId) : null,
          externalMessageId: sent?.id ? String(sent.id) : null,
        });
      } catch (err) {
        console.warn("[sendEquityMessage] inbox log failed", {
          contactId,
          error: err instanceof Error ? err.message : err,
        });
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : "send_error";
      return { ok: false, code: "send_failed", reason };
    }
  }

  // Step 4: timeline append. Best-effort.
  try {
    await getOrCreateConversation(contactId, agentId);
    await appendMessages(contactId, agentId, [
      {
        role: "assistant",
        content: channel === "email" ? `[Email] ${emailSubject}\n\n${body}` : body,
        created_at: sentAt,
        source: `equity_update_${channel}`,
      },
    ]);
  } catch (e) {
    console.warn("[sendEquityMessage] conversation append failed", e);
  }

  // Step 5: audit row + last_contacted_at. Best-effort.
  try {
    await supabaseServer.from("contact_events").insert({
      contact_id: contactId,
      agent_id: agentId,
      event_type: "equity_message_sent",
      metadata: {
        channel,
        length: body.length,
        email_subject: channel === "email" ? emailSubject ?? null : null,
        sms_excerpt: channel === "sms" ? body.slice(0, 80) : null,
      },
      source: "sphere_seller_prediction",
    } as Record<string, unknown>);
  } catch (e) {
    console.warn("[sendEquityMessage] contact_events insert failed", e);
  }

  try {
    await supabaseServer
      .from("contacts")
      .update({ last_contacted_at: sentAt } as Record<string, unknown>)
      .eq("id", contactId)
      .eq("agent_id", agentId);
  } catch (e) {
    console.warn("[sendEquityMessage] last_contacted_at bump failed", e);
  }

  return { ok: true, channel, sentAt };
}
