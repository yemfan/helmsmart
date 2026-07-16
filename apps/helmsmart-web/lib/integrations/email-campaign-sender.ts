/**
 * Email Campaign Sender
 * Sends bulk email campaigns via Resend to targeted client segments
 */

import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail, FROM_ADDRESS } from "@/lib/email";

const emailEnabled = Boolean(process.env.RESEND_API_KEY);

const FROM_DOMAIN = FROM_ADDRESS.split("@")[1];

/**
 * Send an email campaign to all targeted recipients
 */
export async function sendEmailCampaign(
  orgId: string,
  campaignId: string
): Promise<{ ok: boolean; sent: number; failed: number; error?: string }> {
  if (!emailEnabled) {
    return { ok: false, sent: 0, failed: 0, error: "Resend not configured" };
  }

  const db = await createServiceClient();

  try {
    // Load campaign
    const { data: campaign } = await db
      .from("email_campaigns")
      .select("*")
      .eq("id", campaignId)
      .eq("organization_id", orgId)
      .single();

    if (!campaign) return { ok: false, sent: 0, failed: 0, error: "Campaign not found" };

    // Load org for from-name and email
    const { data: org } = await db
      .from("organizations")
      .select("name, slug")
      .eq("id", orgId)
      .single();

    const fromName = campaign.from_name || org?.name || "HelmSmart";
    // Sends must come from the verified domain; a per-org address like
    // {slug}@helmsmart.app is not authorized and Resend rejects it.
    const replyTo = campaign.reply_to || FROM_ADDRESS;

    // Get targeted recipients
    const recipients = await getTargetedRecipients(orgId, campaign);
    if (recipients.length === 0) {
      return { ok: false, sent: 0, failed: 0, error: "No recipients matched targeting criteria" };
    }

    // Mark campaign as sending
    await db
      .from("email_campaigns")
      .update({ status: "sending" })
      .eq("id", campaignId);

    let sent = 0;
    let failed = 0;

    // Resend supports batch sends of up to 100 at a time
    const BATCH_SIZE = 50;
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      const batchPromises = batch.map(async (recipient) => {
        try {
          const personalised = personaliseHtml(campaign.body_html, {
            name: recipient.recipient_name || "there",
            email: recipient.email,
            orgName: fromName,
          });

          // Throws on a rejected send, so the catch below records the
          // recipient as failed instead of counting it as delivered.
          const result = await sendEmail({
            fromName,
            to: recipient.email,
            subject: campaign.subject,
            html: personalised,
            text: campaign.body_text || undefined,
            replyTo,
            headers: {
              "List-Unsubscribe": `<mailto:unsubscribe@${FROM_DOMAIN}?subject=unsubscribe>`,
            },
          });

          // Record recipient
          await db.from("email_campaign_recipients").insert({
            campaign_id: campaignId,
            organization_id: orgId,
            client_id: recipient.client_id || null,
            email: recipient.email,
            recipient_name: recipient.recipient_name,
            resend_email_id: result.id ?? null,
            sent_at: new Date().toISOString(),
          });

          return { ok: true };
        } catch (err) {
          console.error("[email-campaign-sender] send error for", recipient.email, err);
          const reason = err instanceof Error ? err.message : "Unknown error";
          await db.from("email_campaign_recipients").insert({
            campaign_id: campaignId,
            organization_id: orgId,
            client_id: recipient.client_id || null,
            email: recipient.email,
            recipient_name: recipient.recipient_name,
            failed_at: new Date().toISOString(),
            failure_reason: reason,
          });
          return { ok: false };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      sent += batchResults.filter((r) => r.ok).length;
      failed += batchResults.filter((r) => !r.ok).length;
    }

    // Update campaign stats
    await db
      .from("email_campaigns")
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
    console.error("[email-campaign-sender] error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";

    await db
      .from("email_campaigns")
      .update({ status: "failed" })
      .eq("id", campaignId);

    return { ok: false, sent: 0, failed: 0, error: message };
  }
}

/**
 * Get targeted recipients based on campaign targeting rules
 */
async function getTargetedRecipients(
  orgId: string,
  campaign: {
    target_segment: string;
    target_pipeline_stages?: string[] | null;
    target_tags?: string[] | null;
    exclude_unsubscribed: boolean;
  }
): Promise<Array<{ client_id: string; email: string; recipient_name?: string }>> {
  const db = await createServiceClient();

  // Get unsubscribed emails
  const unsubscribedEmails = new Set<string>();
  if (campaign.exclude_unsubscribed) {
    const { data: unsubs } = await db
      .from("email_unsubscribes")
      .select("email")
      .eq("organization_id", orgId);
    (unsubs ?? []).forEach((u) => unsubscribedEmails.add(u.email));
  }

  // Build query
  let query = db
    .from("clients")
    .select("id, first_name, last_name, email, pipeline_stage, status")
    .eq("organization_id", orgId)
    .not("email", "is", null)
    .neq("email", "");

  // Segment filtering
  if (campaign.target_segment === "leads") {
    query = query.eq("status", "lead");
  } else if (campaign.target_segment === "prospects") {
    query = query.eq("status", "prospect");
  } else if (campaign.target_segment === "active") {
    query = query.eq("status", "active");
  } else if (campaign.target_segment === "won") {
    query = query.eq("pipeline_stage", "won");
  } else if (campaign.target_segment === "custom" && campaign.target_pipeline_stages?.length) {
    query = query.in("pipeline_stage", campaign.target_pipeline_stages);
  }

  const { data: clients } = await query;
  if (!clients) return [];

  return clients
    .filter((c) => c.email && !unsubscribedEmails.has(c.email))
    .map((c) => ({
      client_id: c.id,
      email: c.email!,
      recipient_name: [c.first_name, c.last_name].filter(Boolean).join(" ") || undefined,
    }));
}

/**
 * Replace simple merge tags in HTML body
 * Supports: {{name}}, {{email}}, {{org_name}}
 */
function personaliseHtml(html: string, vars: Record<string, string>): string {
  return html
    .replace(/\{\{name\}\}/gi, vars.name || "there")
    .replace(/\{\{email\}\}/gi, vars.email || "")
    .replace(/\{\{org_name\}\}/gi, vars.orgName || "");
}
