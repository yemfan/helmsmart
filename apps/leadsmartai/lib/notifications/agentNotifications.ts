import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  MobileAgentInboxNotificationDto,
  MobileNotificationDeepScreen,
  MobileNotificationPreferencesDto,
} from "@leadsmart/shared";

const DEFAULT_PREFS: MobileNotificationPreferencesDto = {
  push_hot_lead: true,
  push_missed_call: true,
  push_reminder: true,
  // Opt-IN: engagement-milestone pushes are celebration-style noise per
  // the notification philosophy (notify only on revenue opportunity,
  // transaction risk, human action required, or urgent deadline).
  push_post_milestone: false,
  reminder_digest_minutes: 15,
};

export async function getAgentNotificationPreferences(
  agentId: string
): Promise<MobileNotificationPreferencesDto> {
  const { data, error } = await supabaseAdmin
    .from("agent_notification_preferences")
    .select(
      "push_hot_lead, push_missed_call, push_reminder, push_post_milestone, reminder_digest_minutes"
    )
    .eq("agent_id", agentId as unknown as number)
    .maybeSingle();

  if (error || !data) {
    return { ...DEFAULT_PREFS };
  }

  const row = data as {
    push_hot_lead?: boolean;
    push_missed_call?: boolean;
    push_reminder?: boolean;
    push_post_milestone?: boolean;
    reminder_digest_minutes?: number;
  };

  return {
    push_hot_lead: row.push_hot_lead ?? true,
    push_missed_call: row.push_missed_call ?? true,
    push_reminder: row.push_reminder ?? true,
    push_post_milestone: row.push_post_milestone ?? false,
    reminder_digest_minutes:
      typeof row.reminder_digest_minutes === "number"
        ? row.reminder_digest_minutes
        : DEFAULT_PREFS.reminder_digest_minutes,
  };
}

export async function upsertAgentNotificationPreferences(
  agentId: string,
  patch: Partial<
    Pick<
      MobileNotificationPreferencesDto,
      | "push_hot_lead"
      | "push_missed_call"
      | "push_reminder"
      | "push_post_milestone"
      | "reminder_digest_minutes"
    >
  >
): Promise<MobileNotificationPreferencesDto> {
  const current = await getAgentNotificationPreferences(agentId);
  const next: MobileNotificationPreferencesDto = {
    push_hot_lead: patch.push_hot_lead ?? current.push_hot_lead,
    push_missed_call: patch.push_missed_call ?? current.push_missed_call,
    push_reminder: patch.push_reminder ?? current.push_reminder,
    push_post_milestone:
      patch.push_post_milestone ?? current.push_post_milestone,
    reminder_digest_minutes:
      patch.reminder_digest_minutes ?? current.reminder_digest_minutes,
  };

  const { error } = await supabaseAdmin.from("agent_notification_preferences").upsert(
    {
      agent_id: agentId as unknown as number,
      push_hot_lead: next.push_hot_lead,
      push_missed_call: next.push_missed_call,
      push_reminder: next.push_reminder,
      push_post_milestone: next.push_post_milestone,
      reminder_digest_minutes: next.reminder_digest_minutes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "agent_id" }
  );

  if (error) throw new Error(error.message);
  return next;
}

export type InsertInboxParams = {
  agentId: string;
  /**
   * Must stay in step with the `agent_inbox_notifications_type_check` CHECK —
   * an unlisted value fails the insert, and these are written best-effort, so
   * the failure is silent and the agent is simply never told.
   */
  type: "hot_lead" | "missed_call" | "reminder" | "new_lead" | "avatar_ready";
  priority: "high" | "medium" | "low";
  title: string;
  body: string;
  deepLink: {
    screen: MobileNotificationDeepScreen;
    leadId?: string;
    taskId?: string;
  };
  /** When push is skipped (prefs off), set to now(); null = reminder pending digest */
  pushSentAt?: string | null;
};

export async function insertAgentInboxNotification(
  params: InsertInboxParams
): Promise<string> {
  const dataPayload = {
    deep_link: {
      screen: params.deepLink.screen,
      contact_id: params.deepLink.leadId,
      task_id: params.deepLink.taskId,
    },
  };

  const row = {
    agent_id: params.agentId as unknown as number,
    type: params.type,
    priority: params.priority,
    title: params.title.slice(0, 200),
    body: params.body.slice(0, 2000),
    data: dataPayload,
    read: false,
    push_sent_at: params.pushSentAt === undefined ? null : params.pushSentAt,
  };

  const { data, error } = await supabaseAdmin
    .from("agent_inbox_notifications")
    .insert(row as Record<string, unknown>)
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return String((data as { id: string }).id);
}

export async function updateInboxNotificationPushSentAt(
  id: string,
  at: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("agent_inbox_notifications")
    .update({ push_sent_at: at })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function updateManyInboxPushSentAt(ids: string[], at: string): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabaseAdmin
    .from("agent_inbox_notifications")
    .update({ push_sent_at: at })
    .in("id", ids);

  if (error) throw new Error(error.message);
}

function mapInboxRow(row: Record<string, unknown>): MobileAgentInboxNotificationDto {
  return {
    id: String(row.id),
    type: row.type as MobileAgentInboxNotificationDto["type"],
    priority: row.priority as MobileAgentInboxNotificationDto["priority"],
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    read: Boolean(row.read),
    created_at: String(row.created_at ?? ""),
    push_sent_at: row.push_sent_at != null ? String(row.push_sent_at) : null,
    data: (row.data as MobileAgentInboxNotificationDto["data"]) ?? null,
  };
}

export async function listAgentInboxNotifications(
  agentId: string,
  limit: number
): Promise<MobileAgentInboxNotificationDto[]> {
  const { data, error } = await supabaseAdmin
    .from("agent_inbox_notifications")
    .select(
      "id, type, priority, title, body, read, created_at, push_sent_at, data"
    )
    .eq("agent_id", agentId as unknown as number)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(mapInboxRow);
}

export async function markAgentNotificationRead(
  agentId: string,
  notificationId: string,
  read: boolean
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("agent_inbox_notifications")
    .update({ read })
    .eq("id", notificationId)
    .eq("agent_id", agentId as unknown as number);

  if (error) throw new Error(error.message);
}

export async function markAllAgentNotificationsRead(agentId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("agent_inbox_notifications")
    .update({ read: true })
    .eq("agent_id", agentId as unknown as number)
    .eq("read", false);

  if (error) throw new Error(error.message);
}
