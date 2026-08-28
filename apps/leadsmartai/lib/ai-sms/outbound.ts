import twilio from "twilio";
import { supabaseAdmin } from "@/lib/supabase/admin";

function digitsOnly(input: string) {
  return input.replace(/\D/g, "");
}

/** Accepts E.164 or US 10-digit; returns E.164 +1... or null */
export function normalizeToE164(input: string): string | null {
  const d = digitsOnly(input);
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  const last10 = d.slice(-10);
  if (last10.length === 10) return `+1${last10}`;
  return null;
}

function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Missing Twilio credentials");
  return twilio(sid, token);
}

function fromNumber() {
  return (
    process.env.TWILIO_SMS_FROM_NUMBER?.trim() ||
    process.env.TWILIO_PHONE_NUMBER?.trim() ||
    process.env.TWILIO_FROM_NUMBER?.trim() ||
    ""
  );
}

function statusCallbackUrl() {
  const base = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
  // Only attach the status callback when APP_BASE_URL is a valid absolute URL —
  // a scheme-less / malformed value makes Twilio reject the whole send (20001).
  if (!/^https?:\/\/.+/i.test(base)) return undefined;
  return `${base}/api/twilio/sms/status`;
}

export async function sendOutboundSms(params: {
  leadId: string;
  to: string;
  body: string;
  agentId?: string | null;
  actorType?: "agent" | "system" | "ai";
  actorName?: string | null;
  /** Which AI assistant sent this — persisted on sms_messages for timeline attribution. */
  assistantType?: string | null;
  /**
   * This text went to the AGENT about the contact, not to the contact.
   *
   * `leadId` is still needed to look the contact up, but none of the
   * contact-side bookkeeping below applies: an internal alert is not a message
   * the customer received. Recording it as one put the alert in their SMS
   * thread, reset sms_last_outbound_at so the follow-up ladder thought they had
   * just been contacted, and — through markContactActivity — auto-closed the
   * "Follow up with inactive lead" task. Telling the agent a lead was hot
   * quietly cancelled the reminder to chase them.
   */
  internal?: boolean;
}) {
  const client = getTwilioClient();
  const rawFrom = fromNumber();
  if (!rawFrom) {
    throw new Error("Missing TWILIO_SMS_FROM_NUMBER or TWILIO_PHONE_NUMBER / TWILIO_FROM_NUMBER");
  }
  // Normalize the configured from-number to E.164 — tolerate a value saved with
  // spaces/parens/dashes or as bare 10 digits. A malformed `from` is a common
  // cause of Twilio 20001 ("invalid/unrecognized parameter").
  const from = normalizeToE164(rawFrom) || rawFrom;

  const toE164 = normalizeToE164(params.to);
  if (!toE164) {
    throw new Error("Invalid phone number; use E.164 or 10-digit US");
  }

  let message;
  try {
    message = await client.messages.create({
      to: toE164,
      from,
      body: params.body,
      statusCallback: statusCallbackUrl(),
    });
  } catch (err) {
    // Twilio's RestException carries useful debug fields beyond
    // .message — the bare message is sometimes as terse as
    // "Bad request" while the code + moreInfo URL point at the real
    // cause (unverified A2P 10DLC campaign, unreachable number,
    // opted-out recipient, etc). Re-throw with all of it so the API
    // route can surface a meaningful error to the agent.
    const e = err as {
      message?: string;
      code?: number | string;
      status?: number;
      moreInfo?: string;
    };
    const code = e.code ?? null;
    const status = e.status ?? null;
    const moreInfo = e.moreInfo ?? null;
    const baseMsg = e.message?.trim() || "Twilio request failed";
    const detail = [
      code != null ? `code ${code}` : null,
      status != null ? `status ${status}` : null,
      moreInfo ? `see ${moreInfo}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const composed = detail ? `Twilio: ${baseMsg} (${detail})` : `Twilio: ${baseMsg}`;
    const wrapped = new Error(composed);
    // Stash structured fields so callers can render them differently
    // (e.g. show the moreInfo as a clickable link) if they want to.
    Object.assign(wrapped, { twilioCode: code, twilioStatus: status, twilioMoreInfo: moreInfo });
    throw wrapped;
  }

  const sid = String(message.sid ?? "");
  const status = String(message.status ?? "queued");

  // An alert about the contact is not a message to the contact. Everything
  // below writes to their record, so an internal send stops here.
  if (params.internal) {
    return { sid, status, to: toE164 };
  }

  const { error: smsErr } = await supabaseAdmin.from("sms_messages").insert({
    contact_id: params.leadId,
    agent_id: params.agentId ?? null,
    message: params.body,
    direction: "outbound",
    external_message_id: sid || null,
    twilio_status: status,
    assistant_type: params.assistantType ?? null,
  } as Record<string, unknown>);

  if (smsErr) throw smsErr;

  try {
    await supabaseAdmin.from("message_logs").insert({
      contact_id: params.leadId,
      type: "sms",
      status: "sent",
      content: params.body,
    } as Record<string, unknown>);
  } catch {
    // non-fatal
  }

  try {
    await supabaseAdmin.rpc("log_lead_event", {
      p_contact_id: params.leadId,
      p_event_type: "sms_sent",
      p_metadata: {
        to: toE164,
        twilioSid: sid,
        twilioStatus: status,
        actorType: params.actorType ?? "system",
        actorName: params.actorName ?? null,
      },
    });
  } catch {
    // optional timeline
  }

  try {
    await supabaseAdmin
      .from("contacts")
      .update({ sms_last_outbound_at: new Date().toISOString(), last_contacted_at: new Date().toISOString() } as Record<string, unknown>)
      .eq("id", params.leadId);
  } catch {
    // optional column
  }

  // Bump last_activity_at + auto-complete any open inactive-lead
  // follow-up tasks for this contact. The agent is doing the
  // follow-up right now — the to-do is stale.
  //
  // Housekeeping only — must NOT fail the send. The SMS already went
  // out and is persisted at this point; if the activity bump errors
  // we just log and move on, otherwise the caller sees a misleading
  // 5xx for a send that actually succeeded.
  if (params.agentId) {
    try {
      const { markContactActivity } = await import("@/lib/contacts/activity");
      await markContactActivity(params.agentId, params.leadId);
    } catch (e) {
      console.warn(
        "[ai-sms/outbound] markContactActivity failed:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  return {
    sid,
    status,
    to: toE164,
  };
}
