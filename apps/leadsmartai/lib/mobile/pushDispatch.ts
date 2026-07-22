import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendExpoPushMessages, type ExpoPushMessage } from "@/lib/mobile/expoPushSend";
import { listExpoPushTokensForUser } from "@/lib/mobile/pushTokens";
import {
  getAgentNotificationPreferences,
  insertAgentInboxNotification,
  updateInboxNotificationPushSentAt,
} from "@/lib/notifications/agentNotifications";

const INBOUND_PUSH_DEDUPE_MS = 120_000;
const NEEDS_HUMAN_PUSH_DEDUPE_MS = 180_000;
const REMINDER_PUSH_DEDUPE_MS = 86_400_000;

function mobilePushGloballyDisabled() {
  return process.env.MOBILE_PUSH_ENABLED === "false";
}

async function getAuthUserIdForAgent(agentId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("agents")
    .select("auth_user_id")
    .eq("id", agentId as unknown as number)
    .maybeSingle();

  if (error || !data) return null;
  const uid = (data as { auth_user_id?: string | null }).auth_user_id;
  return uid ? String(uid) : null;
}

async function wasRecentLeadEvent(leadId: string, eventType: string, sinceMs: number): Promise<boolean> {
  const since = new Date(Date.now() - sinceMs).toISOString();
  const { data } = await supabaseAdmin
    .from("contact_events")
    .select("id")
    .eq("contact_id", leadId)
    .eq("event_type", eventType)
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();
  return Boolean(data?.id);
}

async function logLeadEventBestEffort(params: {
  leadId: string;
  agentId: string | null;
  eventType: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await supabaseAdmin.from("contact_events").insert({
      contact_id: params.leadId,
      agent_id: params.agentId ?? null,
      event_type: params.eventType,
      // `payload` is the canonical JSONB column on contact_events;
      // an earlier draft of this file used `metadata` (a column that
      // doesn't exist), so the INSERT silently 500'd inside the
      // try/catch on every call. Dedup logic in `wasRecentLeadEvent`
      // was effectively disabled because no rows were ever written.
      payload: params.metadata ?? {},
    } as Record<string, unknown>);
  } catch {
    // ignore
  }
}

function buildMessages(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, string>,
  priority: "high" | "default" = "high"
): ExpoPushMessage[] {
  return tokens.map((to) => ({
    to,
    title,
    body,
    data,
    sound: "default",
    priority,
  }));
}

/** Hot lead: inbox row + immediate high-priority push (when prefs allow). */
export async function dispatchMobileHotLeadPush(params: {
  userId: string;
  agentId: string | null;
  leadId: string;
  title: string;
  body: string;
}): Promise<boolean> {
  if (mobilePushGloballyDisabled() || process.env.MOBILE_PUSH_HOT_LEAD === "false") return false;

  const now = new Date().toISOString();
  let inboxId: string | null = null;

  if (params.agentId) {
    const prefs = await getAgentNotificationPreferences(params.agentId);
    const skipPush = !prefs.push_hot_lead;
    inboxId = await insertAgentInboxNotification({
      agentId: params.agentId,
      type: "hot_lead",
      priority: "high",
      title: params.title,
      body: params.body,
      deepLink: { screen: "lead", leadId: params.leadId },
      pushSentAt: skipPush ? now : null,
    });

    if (skipPush) {
      await logLeadEventBestEffort({
        leadId: params.leadId,
        agentId: params.agentId,
        eventType: "mobile_push_hot_lead",
        metadata: { suppressed: "prefs", title: params.title.slice(0, 80) },
      });
      return false;
    }
  }

  const tokens = await listExpoPushTokensForUser(params.userId);
  if (!tokens.length) {
    if (inboxId) await updateInboxNotificationPushSentAt(inboxId, now);
    return false;
  }

  await sendExpoPushMessages(
    buildMessages(tokens, params.title, params.body, {
      kind: "hot_lead",
      leadId: params.leadId,
      screen: "lead",
    })
  );

  if (inboxId) await updateInboxNotificationPushSentAt(inboxId, now);

  await logLeadEventBestEffort({
    leadId: params.leadId,
    agentId: params.agentId,
    eventType: "mobile_push_hot_lead",
    metadata: { title: params.title.slice(0, 80) },
  });

  return true;
}

/** New inbound SMS (throttled per lead). */
export async function dispatchMobileInboundSmsPush(params: {
  agentId: string;
  leadId: string;
  leadName: string | null;
  preview: string;
}): Promise<void> {
  if (mobilePushGloballyDisabled() || process.env.MOBILE_PUSH_INBOUND_SMS === "false") return;

  if (await wasRecentLeadEvent(params.leadId, "mobile_push_inbound_sms", INBOUND_PUSH_DEDUPE_MS)) {
    return;
  }

  const userId = await getAuthUserIdForAgent(params.agentId);
  if (!userId) return;

  const tokens = await listExpoPushTokensForUser(userId);
  if (!tokens.length) return;

  const name = params.leadName?.trim() || "Lead";
  const preview = params.preview.trim().slice(0, 140);
  const title = "New SMS — LeadSmart AI";
  const body = preview ? `${name}: ${preview}` : `${name} sent a text.`;

  await sendExpoPushMessages(
    buildMessages(tokens, title, body, {
      kind: "inbound_sms",
      leadId: params.leadId,
      screen: "lead",
    })
  );

  await logLeadEventBestEffort({
    leadId: params.leadId,
    agentId: params.agentId,
    eventType: "mobile_push_inbound_sms",
    metadata: { channel: "sms" },
  });
}

/** New inbound email (throttled per lead). */
export async function dispatchMobileInboundEmailPush(params: {
  agentId: string;
  leadId: string;
  leadName: string | null;
  subject: string;
  preview: string;
}): Promise<void> {
  if (mobilePushGloballyDisabled() || process.env.MOBILE_PUSH_INBOUND_EMAIL === "false") return;

  if (await wasRecentLeadEvent(params.leadId, "mobile_push_inbound_email", INBOUND_PUSH_DEDUPE_MS)) {
    return;
  }

  const userId = await getAuthUserIdForAgent(params.agentId);
  if (!userId) return;

  const tokens = await listExpoPushTokensForUser(userId);
  if (!tokens.length) return;

  const name = params.leadName?.trim() || "Lead";
  const sub = params.subject.trim().slice(0, 80);
  const title = "New email — LeadSmart AI";
  const body = sub ? `${name}: ${sub}` : `${name} sent an email.`;

  await sendExpoPushMessages(
    buildMessages(tokens, title, body, {
      kind: "inbound_email",
      leadId: params.leadId,
      screen: "lead",
    })
  );

  await logLeadEventBestEffort({
    leadId: params.leadId,
    agentId: params.agentId,
    eventType: "mobile_push_inbound_email",
    metadata: { channel: "email", preview: params.preview.slice(0, 200) },
  });
}

/**
 * AI explicitly requested a human (distinct from generic hot-lead scoring in some cases).
 * Throttled per lead to avoid duplicate alerts with rapid messages.
 */
export async function dispatchMobileNeedsHumanPush(params: {
  agentId: string;
  leadId: string;
  leadName: string | null;
  channel: "sms" | "email" | "voice";
  reason: string;
}): Promise<void> {
  if (mobilePushGloballyDisabled() || process.env.MOBILE_PUSH_NEEDS_HUMAN === "false") return;

  if (await wasRecentLeadEvent(params.leadId, "mobile_push_needs_human", NEEDS_HUMAN_PUSH_DEDUPE_MS)) {
    return;
  }

  const userId = await getAuthUserIdForAgent(params.agentId);
  if (!userId) return;

  const tokens = await listExpoPushTokensForUser(userId);
  if (!tokens.length) return;

  const name = params.leadName?.trim() || "Lead";
  const reason = params.reason.trim().slice(0, 160);
  const title = "AI needs you — LeadSmart AI";
  const body = reason ? `${name} · ${reason}` : `${name}: please review this conversation.`;

  await sendExpoPushMessages(
    buildMessages(tokens, title, body, {
      kind: "needs_human",
      leadId: params.leadId,
      channel: params.channel,
      reason: reason || "review",
      screen: "lead",
    })
  );

  await logLeadEventBestEffort({
    leadId: params.leadId,
    agentId: params.agentId,
    eventType: "mobile_push_needs_human",
    metadata: { channel: params.channel },
  });
}

/**
 * Follow-up reminder due (cron). Records inbox + relies on digest cron for batched low-priority push.
 */
export async function dispatchMobileReminderPush(params: {
  agentId: string;
  leadId: string;
  leadName: string | null;
  hint?: string;
}): Promise<void> {
  if (mobilePushGloballyDisabled() || process.env.MOBILE_PUSH_REMINDER === "false") return;

  if (await wasRecentLeadEvent(params.leadId, "mobile_push_reminder", REMINDER_PUSH_DEDUPE_MS)) {
    return;
  }

  const prefs = await getAgentNotificationPreferences(params.agentId);
  const now = new Date().toISOString();
  const name = params.leadName?.trim() || "Lead";
  const title = "Follow-up due";
  const body = params.hint?.trim()
    ? `${name}: ${params.hint.trim().slice(0, 140)}`
    : `${name}: time to reach out.`;

  await insertAgentInboxNotification({
    agentId: params.agentId,
    type: "reminder",
    priority: "low",
    title,
    body,
    deepLink: { screen: "lead", leadId: params.leadId },
    pushSentAt: !prefs.push_reminder ? now : null,
  });

  await logLeadEventBestEffort({
    leadId: params.leadId,
    agentId: params.agentId,
    eventType: "mobile_push_reminder",
    metadata: { queued: true },
  });
}

/** Missed inbound call — medium priority inbox + push. Call from voice webhook when wired. */
export async function dispatchMobileMissedCallPush(params: {
  agentId: string;
  leadId: string;
  leadName: string | null;
  fromNumber?: string | null;
}): Promise<boolean> {
  if (mobilePushGloballyDisabled() || process.env.MOBILE_PUSH_MISSED_CALL === "false") {
    return false;
  }

  const prefs = await getAgentNotificationPreferences(params.agentId);
  const now = new Date().toISOString();
  const name = params.leadName?.trim() || "Lead";
  const sub = params.fromNumber?.trim() ? ` from ${params.fromNumber.trim()}` : "";
  const title = "Missed call — LeadSmart AI";
  const body = `${name}${sub}. Tap to follow up.`;

  const skipPush = !prefs.push_missed_call;
  const inboxId = await insertAgentInboxNotification({
    agentId: params.agentId,
    type: "missed_call",
    priority: "medium",
    title,
    body,
    deepLink: { screen: "call_log", leadId: params.leadId },
    pushSentAt: skipPush ? now : null,
  });

  if (skipPush) return false;

  const userId = await getAuthUserIdForAgent(params.agentId);
  if (!userId) {
    await updateInboxNotificationPushSentAt(inboxId, now);
    return false;
  }

  const tokens = await listExpoPushTokensForUser(userId);
  if (!tokens.length) {
    await updateInboxNotificationPushSentAt(inboxId, now);
    return false;
  }

  await sendExpoPushMessages(
    buildMessages(
      tokens,
      title,
      body,
      {
        kind: "missed_call",
        leadId: params.leadId,
        screen: "call_log",
      },
      "default"
    )
  );

  await updateInboxNotificationPushSentAt(inboxId, now);
  return true;
}

/**
 * Scheduled-post publish-failure push. Fires when the
 * publish-scheduled cron exhausts its retry budget on a scheduled
 * post and stamps the row as `failed`. Mobile gets a notification
 * so the agent can open /scheduled, see the last_error, and either
 * reconnect / try a new post or accept the failure.
 *
 * No dedup needed — each scheduled_posts row reaches `failed` at
 * most once, and the cron only stamps the transition once. Caller
 * (the cron's permanent-fail branch) only invokes here.
 *
 * Deep link: `screen: "scheduled"` so the mobile app routes to the
 * scheduled-posts management screen.
 */
export async function dispatchMobilePublishFailurePush(params: {
  agentId: string;
  scheduledPostId: string;
  platform: "facebook" | "instagram" | "linkedin" | "threads";
  errorMessage: string;
}): Promise<boolean> {
  if (mobilePushGloballyDisabled()) return false;

  const platformLabel =
    params.platform === "linkedin"
      ? "LinkedIn"
      : params.platform === "instagram"
        ? "Instagram"
        : params.platform === "threads"
          ? "Threads"
          : "Facebook";
  const title = `⚠️ ${platformLabel} post failed`;
  const body =
    params.errorMessage.slice(0, 140) ||
    "Your scheduled post couldn't publish after multiple retries. Tap to review.";

  const now = new Date().toISOString();
  const inboxId = await insertAgentInboxNotification({
    agentId: params.agentId,
    type: "reminder",
    priority: "high",
    title,
    body,
    // Reuse the `home` deep-link slot — the mobile handler routes
    // by `kind` (`publish_failure`) into /scheduled. Avoids adding
    // another value to MobileNotificationDeepScreen.
    deepLink: { screen: "home" },
    pushSentAt: null,
  });

  const userId = await getAuthUserIdForAgent(params.agentId);
  if (!userId) {
    await updateInboxNotificationPushSentAt(inboxId, now);
    return false;
  }
  const tokens = await listExpoPushTokensForUser(userId);
  if (!tokens.length) {
    await updateInboxNotificationPushSentAt(inboxId, now);
    return false;
  }

  await sendExpoPushMessages(
    buildMessages(
      tokens,
      title,
      body,
      {
        kind: "publish_failure",
        screen: "scheduled",
        scheduledPostId: params.scheduledPostId,
      },
      "high",
    ),
  );
  await updateInboxNotificationPushSentAt(inboxId, now);
  return true;
}

/**
 * Briefing-ready push. Fires once after the daily briefing insert
 * (morning + evening) so the agent's phone gets a "your morning
 * plan is ready" / "your evening summary is in" ping.
 *
 * Idempotency: the briefing insert in createDailyBriefingForAgent
 * already guards via the per-day existing-briefing check, so each
 * (agent, day, kind) tuple generates at most one push.
 *
 * No per-pref opt-out yet — when an agent has push tokens AND the
 * global MOBILE_PUSH_ENABLED is on, we send. A `push_briefing`
 * preference is a fast follow-up if agents start asking to mute
 * briefings specifically.
 *
 * Deep link: opens the mobile Home (where BriefingsCard renders).
 * Marking-as-read happens locally when the agent views Home; the
 * push doesn't carry a "read" bit because the device fires that
 * itself.
 */
export async function dispatchMobileBriefingPush(params: {
  agentId: string;
  kind: "morning" | "evening";
  headline: string | null;
  summary: string;
}): Promise<boolean> {
  if (mobilePushGloballyDisabled()) return false;

  const isMorning = params.kind === "morning";
  const title = isMorning ? "☀️ Morning Briefing" : "🌙 Evening Summary";
  const body =
    params.headline?.trim() ||
    // Trim to the first sentence so the push body stays under iOS'
    // ~120-char display window. Fallback to a generic line.
    params.summary?.split(/[.!?]\s/)[0]?.slice(0, 140) ||
    (isMorning
      ? "Your morning plan is ready in LeadSmart."
      : "Your evening summary is ready in LeadSmart.");

  const now = new Date().toISOString();
  // Notification philosophy: a briefing is a scheduled prompt, not an
  // urgent event — it rides the agent's "reminder" push preference.
  // The inbox row is written either way so the briefing still appears
  // in the notifications inbox; only the push is suppressed.
  const prefs = await getAgentNotificationPreferences(params.agentId);
  const allowPush = prefs.push_reminder !== false;

  // `agent_inbox_notifications.type` is a check-constrained text
  // column allowing hot_lead / missed_call / reminder / new_lead;
  // briefings classify cleanly as "reminder" (a scheduled prompt
  // to look at something). Widening the enum to a dedicated
  // `briefing_*` value is a fast follow-up if filtering-by-type
  // becomes valuable.
  const inboxId = await insertAgentInboxNotification({
    agentId: params.agentId,
    type: "reminder",
    priority: "medium",
    title,
    body,
    deepLink: { screen: "home" },
    pushSentAt: allowPush ? null : now,
  });
  if (!allowPush) return false;

  const userId = await getAuthUserIdForAgent(params.agentId);
  if (!userId) {
    await updateInboxNotificationPushSentAt(inboxId, now);
    return false;
  }

  const tokens = await listExpoPushTokensForUser(userId);
  if (!tokens.length) {
    await updateInboxNotificationPushSentAt(inboxId, now);
    return false;
  }

  await sendExpoPushMessages(
    buildMessages(
      tokens,
      title,
      body,
      {
        kind: isMorning ? "briefing_morning" : "briefing_evening",
        screen: "home",
      },
      "default",
    ),
  );
  await updateInboxNotificationPushSentAt(inboxId, now);
  return true;
}

// ── Post-engagement milestone pushes ─────────────────────────────

export const POST_MILESTONE_THRESHOLDS: readonly number[] = [
  1, 10, 50, 100, 250, 500, 1000,
] as const;

/**
 * Given an old high-water mark and a new engagement total, return
 * the highest threshold that was crossed (>0), or null when no
 * new milestone applies.
 *
 * Examples:
 *   highestCrossed(0,   1)   → 1
 *   highestCrossed(1,  12)   → 10  (we jumped over 1, but 1 was already pushed; surface 10)
 *   highestCrossed(0, 130)   → 100 (skip-ahead: brand-new viral post; only push the biggest)
 *   highestCrossed(100, 110) → null (no new threshold crossed since 100)
 */
export function highestCrossedMilestone(
  oldThreshold: number,
  newScore: number,
): number | null {
  let crossed: number | null = null;
  for (const t of POST_MILESTONE_THRESHOLDS) {
    if (t > oldThreshold && t <= newScore) crossed = t;
  }
  return crossed;
}

/**
 * Engagement-milestone push. Fires when a post's total engagement
 * (likes + comments + shares + saves) crosses one of the
 * POST_MILESTONE_THRESHOLDS. The refresh cron is the only caller —
 * it computes the score after a metrics refresh, compares against
 * `lead_posts.last_milestone_pushed`, and dispatches when crossed.
 *
 * Sparse cadence by design: across a post's whole lifetime, the
 * agent sees at most one push per threshold (7 max). For most
 * posts they'll see 1-2. Skip-ahead (a viral post going from 0 →
 * 130 between cron runs) collapses to a single push at the highest
 * threshold instead of spamming the lower ones.
 *
 * Inbox: row written regardless of push delivery so the in-app
 * notifications surface still shows the milestone even when push
 * is muted.
 *
 * Deep link: `post_history` opens the Posts screen where the row
 * renders with the fresh metrics. No per-row anchor needed —
 * milestone posts are usually top-of-list anyway.
 */
export async function dispatchMobilePostMilestonePush(params: {
  agentId: string;
  leadPostId: string;
  threshold: number;
  platform: "facebook" | "instagram" | "linkedin" | "threads";
  caption: string;
}): Promise<boolean> {
  if (mobilePushGloballyDisabled()) return false;

  const prefs = await getAgentNotificationPreferences(params.agentId);
  const skipPush = !prefs.push_post_milestone;

  const platformLabel =
    params.platform === "linkedin"
      ? "LinkedIn"
      : params.platform === "instagram"
        ? "Instagram"
        : params.platform === "threads"
          ? "Threads"
          : "Facebook";
  // First-engagement push reads differently from the bigger ones —
  // "someone engaged" is the celebration moment; the milestones
  // beyond that are progress-tracking.
  const title =
    params.threshold === 1
      ? `🎉 First engagement on ${platformLabel}`
      : `🚀 ${params.threshold.toLocaleString()} engagements on ${platformLabel}`;
  const captionSnippet = params.caption.replace(/\s+/g, " ").slice(0, 100);
  const body =
    params.threshold === 1
      ? `Someone reacted to your post: "${captionSnippet}${params.caption.length > 100 ? "…" : ""}"`
      : `Your post hit ${params.threshold.toLocaleString()} total engagement: "${captionSnippet}${params.caption.length > 100 ? "…" : ""}"`;

  const now = new Date().toISOString();
  const inboxId = await insertAgentInboxNotification({
    agentId: params.agentId,
    type: "reminder",
    priority: "medium",
    title,
    body,
    deepLink: { screen: "post_history" },
    pushSentAt: skipPush ? now : null,
  });

  if (skipPush) {
    return false;
  }

  const userId = await getAuthUserIdForAgent(params.agentId);
  if (!userId) {
    await updateInboxNotificationPushSentAt(inboxId, now);
    return false;
  }
  const tokens = await listExpoPushTokensForUser(userId);
  if (!tokens.length) {
    await updateInboxNotificationPushSentAt(inboxId, now);
    return false;
  }

  await sendExpoPushMessages(
    buildMessages(
      tokens,
      title,
      body,
      {
        kind: "reminder",
        screen: "post_history",
        leadPostId: params.leadPostId,
        threshold: String(params.threshold),
      },
      "default",
    ),
  );
  await updateInboxNotificationPushSentAt(inboxId, now);
  return true;
}
