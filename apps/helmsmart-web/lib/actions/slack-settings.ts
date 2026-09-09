"use server";

import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { revalidatePath } from "next/cache";
import { notifySlack } from "@/lib/integrations/slack";

/**
 * Save Slack webhook URL for the current org
 */
export async function saveSlackWebhook(
  webhookUrl: string
): Promise<{ ok: boolean; error?: string }> {
  const t = await getServerT("settings");
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { ok: false, error: t("slack.errors.notAuthenticated") };

  // Basic URL validation
  if (webhookUrl && !webhookUrl.startsWith("https://hooks.slack.com/")) {
    return { ok: false, error: t("slack.errors.invalidUrl") };
  }

  const db = await createServiceClient();
  const { error } = await db
    .from("organizations")
    .update({ slack_webhook_url: webhookUrl || null })
    .eq("id", orgId);

  if (error) {
    console.error("[slack-settings] save error:", error);
    return { ok: false, error: t("slack.errors.saveFailed") };
  }

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Update individual Slack notification toggle
 */
export async function saveSlackNotifyToggle(
  field:
    | "slack_notify_new_lead"
    | "slack_notify_approval"
    | "slack_notify_missed_call"
    | "slack_notify_form_submission",
  value: boolean
): Promise<{ ok: boolean }> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { ok: false };

  const db = await createServiceClient();
  await db
    .from("organizations")
    .update({ [field]: value })
    .eq("id", orgId);

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Send a test message to the configured Slack channel
 */
export async function testSlackWebhook(): Promise<{ ok: boolean; error?: string }> {
  const t = await getServerT("settings");
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { ok: false, error: t("slack.errors.notAuthenticated") };

  // This lands in the owner's own workspace, not a customer's inbox, so it
  // goes out in the language the owner reads HelmSmart in.
  const ok = await notifySlack(orgId, {
    text: t("slack.test.text"),
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: t("slack.test.blockText"),
        },
      },
    ],
  });

  if (!ok) {
    return { ok: false, error: t("slack.errors.testSendFailed") };
  }

  return { ok: true };
}
