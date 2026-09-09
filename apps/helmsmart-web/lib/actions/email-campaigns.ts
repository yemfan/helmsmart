"use server";

import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sendEmailCampaign } from "@/lib/integrations/email-campaign-sender";
import { checkActionPermission } from "@/components/role-guard";
import { computeNextRun, type RecurrenceInterval } from "@/lib/recurrence";
import { getServerT } from "@/lib/i18n/server";

export interface CreateEmailCampaignInput {
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  previewText?: string;
  fromName?: string;
  replyTo?: string;
  targetSegment: "all" | "leads" | "prospects" | "active" | "won" | "custom";
  targetPipelineStages?: string[];
  scheduledFor?: string;
  description?: string;
  campaignType?: string;
  // Recurrence
  isRecurring?: boolean;
  recurrenceInterval?: RecurrenceInterval;
  recurrenceDay?: number;
  recurrenceHour?: number;
}

export async function createEmailCampaign(
  input: CreateEmailCampaignInput
): Promise<{ ok: boolean; campaignId?: string; error?: string }> {
  const denied = await checkActionPermission("campaigns.write");
  if (denied) return denied;

  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  const t = await getServerT("marketing");
  if (!orgId) return { ok: false, error: t("errors.notAuthenticated") };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("errors.noUserSession") };

  const db = await createServiceClient();

  // For recurring campaigns, compute the first next_run_at
  let nextRunAt: string | null = null;
  let status = input.scheduledFor ? "scheduled" : "draft";
  if (input.isRecurring && input.recurrenceInterval) {
    nextRunAt = computeNextRun(
      input.recurrenceInterval,
      input.recurrenceDay ?? 1,
      input.recurrenceHour ?? 9,
      new Date()
    );
    status = "recurring";
  }

  const { data: campaign, error } = await db
    .from("email_campaigns")
    .insert({
      organization_id: orgId,
      name: input.name,
      description: input.description,
      campaign_type: input.campaignType ?? "marketing",
      subject: input.subject,
      preview_text: input.previewText,
      body_html: input.bodyHtml,
      body_text: input.bodyText,
      from_name: input.fromName,
      reply_to: input.replyTo,
      target_segment: input.targetSegment,
      target_pipeline_stages: input.targetPipelineStages ?? [],
      scheduled_for: input.scheduledFor ?? null,
      status,
      is_recurring: input.isRecurring ?? false,
      recurrence_interval: input.recurrenceInterval ?? null,
      recurrence_day: input.recurrenceDay ?? null,
      recurrence_hour: input.recurrenceHour ?? 9,
      next_run_at: nextRunAt,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !campaign) {
    return { ok: false, error: error?.message || t("errors.campaigns.createFailed") };
  }

  revalidatePath("/marketing/email");
  return { ok: true, campaignId: campaign.id };
}

export async function updateEmailCampaign(
  campaignId: string,
  input: Partial<CreateEmailCampaignInput>
): Promise<{ ok: boolean; error?: string }> {
  const denied = await checkActionPermission("campaigns.write");
  if (denied) return denied;

  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  const t = await getServerT("marketing");
  if (!orgId) return { ok: false, error: t("errors.notAuthenticated") };

  const db = await createServiceClient();

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.subject !== undefined) updates.subject = input.subject;
  if (input.bodyHtml !== undefined) updates.body_html = input.bodyHtml;
  if (input.bodyText !== undefined) updates.body_text = input.bodyText;
  if (input.previewText !== undefined) updates.preview_text = input.previewText;
  if (input.fromName !== undefined) updates.from_name = input.fromName;
  if (input.replyTo !== undefined) updates.reply_to = input.replyTo;
  if (input.targetSegment !== undefined) updates.target_segment = input.targetSegment;
  if (input.scheduledFor !== undefined) {
    updates.scheduled_for = input.scheduledFor || null;
    updates.status = input.scheduledFor ? "scheduled" : "draft";
  }

  const { error } = await db
    .from("email_campaigns")
    .update(updates)
    .eq("id", campaignId)
    .eq("organization_id", orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/marketing/email");
  revalidatePath(`/marketing/email/${campaignId}`);
  return { ok: true };
}

export async function sendEmailCampaignNow(
  campaignId: string
): Promise<{ ok: boolean; error?: string }> {
  const denied = await checkActionPermission("campaigns.write");
  if (denied) return denied;

  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  const t = await getServerT("marketing");
  if (!orgId) return { ok: false, error: t("errors.notAuthenticated") };

  const supabase = await createClient();
  const { data: campaign } = await supabase
    .from("email_campaigns")
    .select("status")
    .eq("id", campaignId)
    .eq("organization_id", orgId)
    .single();

  if (!campaign) return { ok: false, error: t("errors.campaigns.notFound") };
  if (campaign.status !== "draft" && campaign.status !== "scheduled") {
    return { ok: false, error: t("errors.campaigns.cannotSendStatus", { status: campaign.status }) };
  }

  const result = await sendEmailCampaign(orgId, campaignId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/marketing/email");
  return { ok: true };
}

export async function deleteEmailCampaign(
  campaignId: string
): Promise<{ ok: boolean; error?: string }> {
  const denied = await checkActionPermission("campaigns.write");
  if (denied) return denied;

  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  const t = await getServerT("marketing");
  if (!orgId) return { ok: false, error: t("errors.notAuthenticated") };

  const supabase = await createClient();
  const { data: campaign } = await supabase
    .from("email_campaigns")
    .select("status")
    .eq("id", campaignId)
    .eq("organization_id", orgId)
    .single();

  if (!campaign) return { ok: false, error: t("errors.campaigns.notFound") };
  if (campaign.status !== "draft") return { ok: false, error: t("errors.campaigns.onlyDraftsDeletable") };

  const db = await createServiceClient();
  await db.from("email_campaigns").delete().eq("id", campaignId).eq("organization_id", orgId);

  revalidatePath("/marketing/email");
  return { ok: true };
}

export async function listEmailCampaigns() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("email_campaigns")
    .select("id, name, subject, target_segment, status, total_recipients, delivered_count, open_count, click_count, scheduled_for, sent_at, created_at, is_recurring, recurrence_interval, recurrence_day, recurrence_hour, next_run_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
}

export async function getEmailCampaign(campaignId: string) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("email_campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("organization_id", orgId)
    .single();

  return data;
}

export async function getEmailCampaignRecipients(campaignId: string) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("email_campaign_recipients")
    .select("id, email, recipient_name, sent_at, failed_at, failure_reason, opened_at, unsubscribed_at")
    .eq("campaign_id", campaignId)
    .order("sent_at", { ascending: false })
    .limit(200);

  return data ?? [];
}
