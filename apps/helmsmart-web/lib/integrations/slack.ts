/**
 * Slack integration — Incoming Webhooks
 * No OAuth needed; each org pastes a webhook URL from their Slack app.
 * https://api.slack.com/messaging/webhooks
 */

import { createServiceClient } from "@/lib/supabase/server";
import { orgWriteLocale } from "@/lib/i18n/userLocale";
import { translatorFor } from "@/lib/i18n/translator";

interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

interface SlackMessage {
  text: string; // fallback for notifications
  blocks?: SlackBlock[];
}

/**
 * Send a message to the org's Slack workspace.
 * Returns true on success, false if not configured or on error.
 * Never throws — Slack failures must not break core flows.
 */
export async function notifySlack(
  orgId: string,
  message: SlackMessage
): Promise<boolean> {
  try {
    const db = await createServiceClient();
    const { data: org } = await db
      .from("organizations")
      .select("slack_webhook_url, name")
      .eq("id", orgId)
      .maybeSingle();

    if (!org?.slack_webhook_url) return false;

    const res = await fetch(org.slack_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    return res.ok;
  } catch (e) {
    console.error("[slack] notify error:", e);
    return false;
  }
}

/**
 * Send a Slack notification for a new form submission.
 */
export async function notifySlackFormSubmission(
  orgId: string,
  opts: {
    formTitle: string;
    name?: string;
    email?: string;
    phone?: string;
    submissionsUrl: string;
    clientUrl?: string;
  }
): Promise<void> {
  const db = await createServiceClient();
  const { data: org } = await db
    .from("organizations")
    .select("slack_webhook_url, slack_notify_form_submission")
    .eq("id", orgId)
    .maybeSingle();

  if (!org?.slack_webhook_url || org.slack_notify_form_submission === false) return;

  /*
   * Slack is the OWNER's channel, so this reads in the business's language —
   * the same rule as an owner-facing email. There is no request behind a
   * webhook or a cron, so the locale comes from the org (see
   * lib/i18n/userLocale.ts) rather than a cookie.
   */
  const t = translatorFor(await orgWriteLocale(orgId, db), "settings");
  const who = opts.name || opts.email || opts.phone || t("slack.notify.formSubmission.someone");
  const contact = [opts.email, opts.phone].filter(Boolean).join(" · ");

  await notifySlack(orgId, {
    text: t("slack.notify.formSubmission.text", { form: opts.formTitle, who }),
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: t("slack.notify.formSubmission.heading", { form: opts.formTitle }),
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: t("slack.notify.formSubmission.name", { value: opts.name || "—" }) },
          { type: "mrkdwn", text: t("slack.notify.formSubmission.contact", { value: contact || "—" }) },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: t("slack.notify.formSubmission.viewSubmissions") },
            url: opts.submissionsUrl,
            style: "primary",
          },
          ...(opts.clientUrl
            ? [{
                type: "button",
                text: { type: "plain_text", text: t("slack.notify.formSubmission.viewInCrm") },
                url: opts.clientUrl,
              }]
            : []),
        ],
      },
    ],
  });
}

/**
 * Send a Slack notification for a new lead (client) created.
 */
export async function notifySlackNewLead(
  orgId: string,
  opts: {
    name: string;
    email?: string;
    phone?: string;
    source?: string;
    clientUrl: string;
  }
): Promise<void> {
  const db = await createServiceClient();
  const { data: org } = await db
    .from("organizations")
    .select("slack_webhook_url, slack_notify_new_lead")
    .eq("id", orgId)
    .maybeSingle();

  if (!org?.slack_webhook_url || org.slack_notify_new_lead === false) return;
  const t = translatorFor(await orgWriteLocale(orgId, db), "settings");

  const contact = [opts.email, opts.phone].filter(Boolean).join(" · ");

  await notifySlack(orgId, {
    text: t("slack.notify.newLead.text", { name: opts.name }),
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: t("slack.notify.newLead.heading", { name: opts.name }),
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: t("slack.notify.newLead.contact", { value: contact || "—" }) },
          { type: "mrkdwn", text: t("slack.notify.newLead.source", { value: opts.source || t("slack.notify.newLead.manual") }) },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: t("slack.notify.newLead.viewInCrm") },
            url: opts.clientUrl,
            style: "primary",
          },
        ],
      },
    ],
  });
}

/**
 * Send a Slack notification for a missed call.
 */
export async function notifySlackMissedCall(
  orgId: string,
  opts: {
    callerNumber: string;
    autoTexted: boolean;
    voiceUrl: string;
  }
): Promise<void> {
  const db = await createServiceClient();
  const { data: org } = await db
    .from("organizations")
    .select("slack_webhook_url, slack_notify_missed_call")
    .eq("id", orgId)
    .maybeSingle();

  if (!org?.slack_webhook_url || org.slack_notify_missed_call === false) return;
  const t = translatorFor(await orgWriteLocale(orgId, db), "settings");

  const autoTextNote = opts.autoTexted ? t("slack.notify.missedCall.autoTexted") : t("slack.notify.missedCall.noAutoText");

  await notifySlack(orgId, {
    text: t("slack.notify.missedCall.text", { number: opts.callerNumber, note: autoTextNote }),
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: t("slack.notify.missedCall.heading", { number: opts.callerNumber, note: autoTextNote }),
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: t("slack.notify.missedCall.viewInReception") },
            url: opts.voiceUrl,
          },
        ],
      },
    ],
  });
}

/**
 * Send a Slack notification for a pending AI approval.
 */
export async function notifySlackApprovalPending(
  orgId: string,
  opts: {
    employeeName: string;
    description: string;
    approvalsUrl: string;
  }
): Promise<void> {
  const db = await createServiceClient();
  const { data: org } = await db
    .from("organizations")
    .select("slack_webhook_url, slack_notify_approval")
    .eq("id", orgId)
    .maybeSingle();

  if (!org?.slack_webhook_url || org.slack_notify_approval === false) return;
  const t = translatorFor(await orgWriteLocale(orgId, db), "settings");

  await notifySlack(orgId, {
    text: t("slack.notify.approval.text", { employee: opts.employeeName, description: opts.description }),
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: t("slack.notify.approval.heading", { employee: opts.employeeName, description: opts.description }),
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: t("slack.notify.approval.review") },
            url: opts.approvalsUrl,
            style: "primary",
          },
        ],
      },
    ],
  });
}
