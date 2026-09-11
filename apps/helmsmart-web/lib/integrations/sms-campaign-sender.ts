/**
 * SMS Campaign Sender
 * Sends SMS campaigns to targeted recipients via Twilio
 */

import { createServiceClient } from "@/lib/supabase/server";
import { decideConsent, type ConsentInputs } from "@helm/dna-communication";
import { normalizePhoneE164 } from "@/lib/phone";
import { logSMSCommunication } from "./communication-auto-logger";
import { twilioSender } from "@/lib/twilio-sender";
import { inputsFor, loadOrgOptOuts } from "@/lib/consent";
import { outcomeForLog, sendSmsGuarded } from "@/lib/outbound-send";

// Whether a sender exists at all — the actual choice of sender is made per send
// by twilioSender() inside the shared send path, so this file no longer carries
// its own copy of that rule. (The var is TWILIO_FROM_NUMBER; the old
// TWILIO_PHONE_NUMBER was never set anywhere, so every campaign run logged
// "Twilio not configured" and no campaign SMS ever sent.)
const configured =
  Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) && twilioSender(null) !== null;
if (!configured) {
  console.warn("[sms-campaign-sender] Twilio not configured");
}

type Recipient = {
  client_id: string;
  phone_number: string;
  recipient_name?: string;
  recipient_email?: string;
  consent: ConsentInputs;
};

/**
 * Send an SMS campaign to targeted recipients
 * Returns count of sent messages
 */
export async function sendSMSCampaign(
  orgId: string,
  campaignId: string
): Promise<{ ok: boolean; sent: number; failed: number; error?: string }> {
  if (!configured) {
    return { ok: false, sent: 0, failed: 0, error: "Twilio not configured" };
  }

  const supabase = await createServiceClient();

  try {
    // Get campaign details
    const { data: campaign } = await supabase
      .from("sms_campaigns")
      .select("*")
      .eq("id", campaignId)
      .eq("organization_id", orgId)
      .single();

    if (!campaign) {
      return { ok: false, sent: 0, failed: 0, error: "Campaign not found" };
    }

    // Get recipients based on targeting rules
    const recipients = await getTargetedRecipients(orgId, campaign);

    if (recipients.length === 0) {
      return { ok: false, sent: 0, failed: 0, error: "No recipients matched the targeting criteria" };
    }

    // Send messages
    let sent = 0;
    let failed = 0;
    const recipientIds: string[] = [];

    for (const recipient of recipients) {
      // Twilio only reliably delivers to E.164 — a bare number returns a SID
      // (looks "sent") but never arrives. Normalize and skip the ones that can't.
      const normalized = normalizePhoneE164(recipient.phone_number);
      if (!normalized.ok) {
        console.error("[sms-campaign-sender] bad phone, skipping:", normalized.error);
        failed++;
        continue;
      }
      const to = normalized.value;

      // Through the shared send path: the consent guard (with the opt-outs
      // loaded once for the whole list), the shared sender rules, and a carrier
      // "unsubscribed" refusal recorded as an opt-out. No `messages` row — a
      // campaign is recorded in sms_campaign_recipients below.
      const outcome = await sendSmsGuarded({
        db: supabase,
        orgId,
        clientId: recipient.client_id,
        to,
        body: campaign.message_text,
        fromNumber: null,
        purpose: "marketing",
        consentInputs: recipient.consent,
      });
      if (!outcome.ok) {
        console.error("[sms-campaign-sender] message not sent:", outcomeForLog(outcome));
        failed++;
        continue;
      }

      // Record in database
      const { data: record } = await supabase
        .from("sms_campaign_recipients")
        .insert({
          campaign_id: campaignId,
          organization_id: orgId,
          client_id: recipient.client_id,
          phone_number: to,
          recipient_name: recipient.recipient_name,
          recipient_email: recipient.recipient_email,
          twilio_sid: outcome.externalId,
          sent_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (record) {
        recipientIds.push(record.id);
        sent++;

        // Auto-log the communication
        await logSMSCommunication({
          clientId: recipient.client_id,
          phoneNumber: to,
          messageText: campaign.message_text,
          twilioSid: outcome.externalId ?? "",
          campaignId: campaignId,
        });
      }
    }

    // Update campaign stats
    await supabase
      .from("sms_campaigns")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        total_recipients: recipients.length,
        delivered_count: sent,
        failed_count: failed,
      })
      .eq("id", campaignId);

    return { ok: true, sent, failed };
  } catch (err) {
    console.error("[sms-campaign-sender] error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, sent: 0, failed: 0, error: msg };
  }
}

/**
 * Get targeted recipients based on campaign targeting rules
 */
async function getTargetedRecipients(
  orgId: string,
  campaign: any
): Promise<Recipient[]> {
  const supabase = await createServiceClient();

  /*
   * Every opt-out, not just this table's. This used to read only
   * sms_unsubscribes — and compared its numbers to the client's phone as typed,
   * so "(626) 755-7917" never matched "+16267557917" — while a client whose
   * page said "Opted out of text messages" was texted anyway. Throws if the
   * opt-outs can't be read, which fails the campaign rather than texting
   * people who said no.
   */
  const optOuts = await loadOrgOptOuts(supabase, orgId);

  // Build query
  let query = supabase
    .from("clients")
    .select("id, first_name, last_name, email, phone")
    .eq("organization_id", orgId)
    .not("phone", "is", null);

  // Apply segment filtering
  if (campaign.target_segment === "leads") {
    query = query.eq("pipeline_stage", "lead");
  } else if (campaign.target_segment === "prospects") {
    query = query.eq("pipeline_stage", "prospect");
  } else if (campaign.target_segment === "active") {
    query = query.eq("status", "active");
  } else if (campaign.target_segment === "won") {
    query = query.eq("pipeline_stage", "won");
  } else if (campaign.target_segment === "custom" && campaign.target_pipeline_stages?.length) {
    query = query.in("pipeline_stage", campaign.target_pipeline_stages);
  }

  const { data: clients } = await query;

  if (!clients) return [];

  // Filter by tags if provided
  if (campaign.target_tags?.length > 0) {
    // Tag filtering would need a junction table; for now include all
    // TODO: implement tags support
  }

  // Exclude by tags
  if (campaign.exclude_tags?.length > 0) {
    // Exclude logic
    // TODO: implement tags support
  }

  return clients
    .map((c) => ({
      client_id: c.id,
      phone_number: c.phone,
      recipient_name: [c.first_name, c.last_name].filter(Boolean).join(" "),
      recipient_email: c.email,
      consent: inputsFor(optOuts, { clientId: c.id, phone: c.phone }),
    }))
    .filter((r) => decideConsent("sms", "marketing", r.consent).allowed);
}
