import "server-only";

import twilio from "twilio";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  ClickToCallError,
  validateClickToCallInput,
  type NormalizedClickToCall,
} from "./clickToCall";

/**
 * Server-side click-to-call.
 *
 * Steps:
 *   1. Validate inputs (phone normalization + caller ID present)
 *   2. Insert a `lead_calls` row in 'queued' status to obtain a UUID
 *      we can route the bridge through
 *   3. Hit Twilio REST `calls.create({ to: agent, from: callerId,
 *      url: <our bridge URL with our call uuid in it> })`
 *   4. Update the row with Twilio's call SID
 *
 * The bridge URL is `${appBaseUrl}/api/voice/bridge/[callId]` and
 * returns TwiML that `<Dial>`s the contact. Twilio's status callback
 * webhook (separate route, not in this PR) updates the row's status
 * over time.
 */
export async function startClickToCall(args: {
  agentId: string;
  contactId: string;
  agentPhoneRaw: string | null;
  contactPhoneRaw: string | null;
  whisper?: string | null;
  /** App base URL like "https://closebossai.com". The bridge URL
   *  is derived from this. */
  appBaseUrl: string;
}): Promise<{ callId: string; twilioCallSid: string }> {
  const callerId =
    process.env.TWILIO_PHONE_NUMBER?.trim() ||
    process.env.TWILIO_FROM_NUMBER?.trim() ||
    null;

  const normalized: NormalizedClickToCall = validateClickToCallInput({
    agentPhoneRaw: args.agentPhoneRaw,
    contactPhoneRaw: args.contactPhoneRaw,
    callerId,
  });

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    throw new ClickToCallError(
      "twilio_not_configured",
      "Twilio is not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
    );
  }

  // 1. Pre-create the lead_calls row so the bridge URL has a stable
  //    id to look up. Status starts as 'queued' — the webhook will
  //    advance it as Twilio progresses.
  const { data: callRow, error: insertErr } = await supabaseAdmin
    .from("lead_calls")
    .insert({
      twilio_call_sid: pendingPlaceholderSid(),
      direction: "outbound",
      from_phone: normalized.callerId,
      to_phone: normalized.contactPhone,
      agent_id: args.agentId,
      contact_id: args.contactId,
      status: "queued",
      metadata: {
        kind: "click_to_call",
        whisper: args.whisper ?? null,
        agent_phone: normalized.agentPhone,
      },
    })
    .select("id")
    .single();

  if (insertErr || !callRow) {
    throw new ClickToCallError(
      "twilio_api_failed",
      `Could not record call attempt: ${insertErr?.message ?? "no row returned"}`,
    );
  }

  const callId = String((callRow as { id: string }).id);
  const baseUrl = args.appBaseUrl.replace(/\/+$/, "");
  const bridgeUrl = `${baseUrl}/api/voice/bridge/${callId}`;
  const statusCallbackUrl = `${baseUrl}/api/voice/status-callback`;

  // 2. Place the actual call.
  let twilioCallSid: string;
  try {
    const client = twilio(accountSid, authToken);
    const call = await client.calls.create({
      to: normalized.agentPhone,
      from: normalized.callerId,
      url: bridgeUrl,
      method: "GET",
      statusCallback: statusCallbackUrl,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    });
    twilioCallSid = call.sid;
  } catch (e) {
    // Mark the row failed so it doesn't sit forever as 'queued'.
    await supabaseAdmin
      .from("lead_calls")
      .update({ status: "failed", metadata: { error: (e as Error).message } })
      .eq("id", callId);
    throw new ClickToCallError(
      "twilio_api_failed",
      `Twilio rejected the call: ${(e as Error).message}`,
    );
  }

  // 3. Patch the row with the real Twilio SID.
  await supabaseAdmin
    .from("lead_calls")
    .update({ twilio_call_sid: twilioCallSid, status: "ringing" })
    .eq("id", callId);

  return { callId, twilioCallSid };
}

/** Placeholder SID for the brief window between insert + Twilio
 *  call.create. The unique constraint on twilio_call_sid forces us
 *  to put SOMETHING here — a UUID-shaped string with the right
 *  prefix is conventional. */
function pendingPlaceholderSid(): string {
  return `pending_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}
