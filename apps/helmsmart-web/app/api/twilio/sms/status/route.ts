/**
 * Twilio SMS Status Callback — POST /api/twilio/sms/status
 *
 * Twilio calls this as a message moves through its lifecycle
 * (queued → sent → delivered, or failed/undelivered). We set the
 * statusCallback URL on outbound messages.create() (see sendSms), so this
 * records the real delivery outcome against the row whose external_id matches
 * the Twilio MessageSid. The SMS thread then shows Delivered/Failed instead of
 * a misleading "Sent".
 *
 * Configure: nothing to do in the Twilio console — the callback URL is passed
 * per-message at send time.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyTwilioSignature, formParams } from "@/lib/twilio-verify";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const params = formParams(formData);
  if (!verifyTwilioSignature(request, params)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const sid = params.MessageSid ?? params.SmsSid ?? null;
  const status = params.MessageStatus ?? params.SmsStatus ?? null;
  if (!sid || !status) {
    // Nothing actionable, but ack so Twilio doesn't retry.
    return new NextResponse(null, { status: 204 });
  }

  const supabase = await createServiceClient();
  await supabase
    .from("messages")
    .update({
      twilio_status: status,
      delivery_error_code: params.ErrorCode ?? null,
      delivery_error_message: params.ErrorMessage ?? null,
    })
    .eq("external_id", sid);

  /*
   * Campaign sends land in a different table.
   *
   * sms_campaign_recipients records its own twilio_sid and has had delivered_at,
   * failed_at and failure_reason since it shipped — but this webhook only ever
   * looked at `messages`, so a campaign row was written at send time and never
   * updated. Every campaign has therefore reported the number it handed Twilio,
   * not the number that arrived, which on this account has been very different:
   * unregistered A2P sends come back 30034 after the fact.
   *
   * A campaign message is not in `messages` and a conversation message is not in
   * this table, so the two updates never collide — one of them simply matches
   * nothing, which costs a no-op.
   */
  const failed = status === "failed" || status === "undelivered";
  if (status === "delivered" || failed) {
    await supabase
      .from("sms_campaign_recipients")
      .update(
        failed
          ? {
              failed_at: new Date().toISOString(),
              // The code is the part that is actually diagnosable — 30034 says
              // "unregistered", 21610 says "they replied STOP". Keep both.
              failure_reason: [params.ErrorCode, params.ErrorMessage].filter(Boolean).join(" ") || status,
            }
          : { delivered_at: new Date().toISOString() },
      )
      .eq("twilio_sid", sid);
  }

  return new NextResponse(null, { status: 204 });
}
