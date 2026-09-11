"use server";

import { getServerT } from "@/lib/i18n/server";
import { revalidatePath } from "next/cache";
import { notifySlack } from "@/lib/integrations/slack";
import { updateOrg } from "@/lib/actions/org-update";
import { getMemberOrgId } from "@/lib/auth/org-context";

// Both writes go through `updateOrg`: the RLS client, with the changed rows
// asked back. They used the service client and discarded the result, so a
// switch flipped on screen stayed flipped whether or not the column changed —
// and the service client trusted whatever org id the cookie carried.

/**
 * Save Slack webhook URL for the current org
 */
export async function saveSlackWebhook(
  webhookUrl: string
): Promise<{ ok: boolean; error?: string }> {
  const t = await getServerT("settings");
  const orgId = await getMemberOrgId();
  if (!orgId) return { ok: false, error: t("slack.errors.notAuthenticated") };

  // Basic URL validation
  if (webhookUrl && !webhookUrl.startsWith("https://hooks.slack.com/")) {
    return { ok: false, error: t("slack.errors.invalidUrl") };
  }

  const res = await updateOrg(
    orgId,
    { slack_webhook_url: webhookUrl || null },
    "slack-settings.saveSlackWebhook",
  );
  if (!res.ok) return { ok: false, error: res.error };

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
): Promise<{ ok: boolean; error?: string }> {
  const t = await getServerT("settings");
  const orgId = await getMemberOrgId();
  if (!orgId) return { ok: false, error: t("slack.errors.notAuthenticated") };

  const res = await updateOrg(orgId, { [field]: value }, "slack-settings.saveSlackNotifyToggle");
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Send a test message to the configured Slack channel
 */
export async function testSlackWebhook(): Promise<{ ok: boolean; error?: string }> {
  const t = await getServerT("settings");
  const orgId = await getMemberOrgId();
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
