import type { ContactId, LeadId } from "./lead";
import type { NotificationDeliveryTiming } from "./lead-attention-score";
import type { NotificationPriority } from "./notification-priority";
import type { DealPredictionLabel } from "./deal-prediction";
import type { MobilePipelineSlug } from "../constants/mobile-pipeline";

/**
 * DTOs for LeadSmart CRM mobile HTTP API (`/api/mobile/*`).
 * Field names follow CRM JSON conventions (snake_case on nested message rows).
 */

export type MobileInboxThreadDto = {
  leadId: LeadId;
  /**
   * "call" threads carry the AI call summary as their preview. Anything
   * switching on this must handle all three — a binary sms/email ternary
   * silently labels a call as an email.
   */
  channel: "sms" | "email" | "call";
  leadName: string | null;
  preview: string;
  lastMessageAt: string;
  lastDirection: "inbound" | "outbound";
  messageId: string;
  /** `leads.rating === "hot"` or a recent `nurture_alerts` row with `type === "hot"`. */
  isHotLead: boolean;
};

export type MobileSmsMessageDto = {
  id: string;
  message: string;
  direction: "inbound" | "outbound";
  created_at: string;
};

export type MobileEmailMessageDto = {
  id: string;
  subject: string | null;
  message: string;
  direction: "inbound" | "outbound";
  created_at: string;
};

/** A call in a lead's thread: the AI summary is the body, the length rides beside it. */
export type MobileCallDto = {
  id: string;
  /** From call_logs.notes. Empty when nobody transcribed the call — render it as such, never invent one. */
  summary: string;
  direction: "inbound" | "outbound";
  /** completed, missed, no_answer, in_progress — raw, for clients that want it. */
  status: string | null;
  duration_seconds: number | null;
  created_at: string;
};

export type MobileLeadConversationsDto = {
  sms: MobileSmsMessageDto[];
  email: MobileEmailMessageDto[];
  /** Absent from payloads an app cached before 1.7.0 — treat missing as none. */
  calls?: MobileCallDto[];
};

/** After `POST /api/mobile/leads/:id/sms/send` */
export type MobileSmsSendResponseDto = {
  message: MobileSmsMessageDto;
};

/** After `POST /api/mobile/leads/:id/email/send` */
export type MobileEmailSendResponseDto = {
  message: MobileEmailMessageDto;
};

/** After `POST /api/mobile/leads/:id/sms/ai-reply` */
export type MobileSmsAiReplyResponseDto = {
  suggestion: string;
};

/** After `POST /api/mobile/leads/:id/email/ai-reply` */
export type MobileEmailAiReplyResponseDto = {
  subject: string;
  body: string;
};

export type MobilePipelineStageOptionDto = {
  id: string;
  mobile_slug: MobilePipelineSlug;
  name: string;
  color: string | null;
  position: number;
};

export type MobileLeadPipelineDto = {
  stage_id: string | null;
  mobile_slug: MobilePipelineSlug | null;
  name: string | null;
};

export type MobileTaskStatus = "open" | "done" | "cancelled";
export type MobileTaskPriority = "low" | "medium" | "high" | "urgent";

export type MobileLeadTaskDto = {
  id: string;
  contact_id: ContactId;
  lead_name: string | null;
  title: string;
  description: string | null;
  due_at: string | null;
  status: MobileTaskStatus;
  priority: MobileTaskPriority;
  task_type: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type MobileTasksGroupedResponseDto = {
  stages: MobilePipelineStageOptionDto[];
  overdue: MobileLeadTaskDto[];
  today: MobileLeadTaskDto[];
  upcoming: MobileLeadTaskDto[];
};

/** Reserved for external sync; `local` = CRM-only appointment. */
export type MobileCalendarProvider = "google" | "outlook" | "local";

export type MobileCalendarEventStatus = "scheduled" | "cancelled" | "completed";

export type MobileCalendarEventDto = {
  id: string;
  contact_id: ContactId;
  lead_name: string | null;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  status: MobileCalendarEventStatus;
  /** Provider when synced; omit or `local` for manually entered mobile events. */
  calendar_provider: MobileCalendarProvider | null;
  external_event_id: string | null;
  external_calendar_id: string | null;
  created_at: string;
  updated_at: string;
};

export type MobileCalendarEventsListResponseDto = {
  events: MobileCalendarEventDto[];
};

export type MobileBookingLinkDto = {
  id: string;
  contact_id: ContactId;
  lead_name: string | null;
  booking_url: string;
  label: string | null;
  share_message: string | null;
  expires_at: string | null;
  created_at: string;
};

export type MobileFollowUpReminderDto = {
  contact_id: ContactId;
  lead_name: string | null;
  next_contact_at: string;
  /** True when `next_contact_at` is before now. */
  overdue: boolean;
};

export type MobileRemindersResponseDto = {
  upcoming_appointments: MobileCalendarEventDto[];
  overdue_tasks: MobileLeadTaskDto[];
  follow_ups: MobileFollowUpReminderDto[];
};

/**
 * Lead record from mobile list/detail: Supabase `leads` row plus hydration fields.
 * Intentionally loose beyond known mobile additions — CRM selects evolve over time.
 */
export type MobileLeadRecordDto = Record<string, unknown> & {
  id: string;
  display_phone: string | null;
  ai_lead_score: number | null;
  ai_intent: string | null;
  ai_timeline: string | null;
  ai_confidence: number | null;
  ai_explanation: string[];
  prediction_score?: number | null;
  prediction_label?: DealPredictionLabel | string | null;
  prediction_computed_at?: string | null;
};

export type MobileLeadDetailResponseDto = {
  lead: MobileLeadRecordDto;
  conversations: MobileLeadConversationsDto;
  pipeline: MobileLeadPipelineDto;
  next_open_task: MobileLeadTaskDto | null;
  pipeline_stages: MobilePipelineStageOptionDto[];
  /** Earliest future scheduled appointment for this lead, if any. */
  next_appointment: MobileCalendarEventDto | null;
  /** Recent booking links for this lead (newest first). */
  booking_links: MobileBookingLinkDto[];
};

export type MobileLeadsListResponseDto = {
  leads: MobileLeadRecordDto[];
  total: number;
  page: number;
  pageSize: number;
};

export type MobilePushRegisterRequestDto = {
  expoPushToken: string;
  platform?: string;
  deviceId?: string | null;
  appVersion?: string | null;
};

export type MobileApiErrorCode = "NO_AGENT_ROW" | string;

/**
 * `data.kind` on Expo push notifications from LeadSmart CRM.
 * All `data` values are strings for APNs/FCM compatibility.
 */
export type MobilePushNotificationKind =
  | "hot_lead"
  | "inbound_sms"
  | "inbound_email"
  | "needs_human"
  | "reminder"
  | "missed_call"
  | "reminder_digest";

/** In-app / push routing target (strings for Expo `data`). */
export type MobileNotificationDeepScreen =
  | "lead"
  | "call_log"
  | "task"
  | "notifications"
  | "lead_queue"
  /** Briefing-ready pushes (morning / evening) deep-link home where
   *  BriefingsCard renders the new briefing inline. */
  | "home"
  /** Publish-failure pushes (cron-failed scheduled posts) deep-link
   *  to the scheduled-posts management screen so the agent can see
   *  the last_error context + decide next steps. */
  | "scheduled"
  /** Engagement-milestone pushes (post crossed 10/50/100/etc.) deep-
   *  link to the post-history screen where the row renders with the
   *  refreshed metrics. */
  | "post_history";

/**
 * Contract for `notification.request.content.data` on LeadSmart AI-originated pushes.
 * Optional fields may be omitted by older servers. Values are strings for FCM/APNs.
 */
export type MobilePushNotificationData = {
  kind: MobilePushNotificationKind;
  /** Present for lead-centric kinds; omit for digest-only. */
  leadId?: string;
  /** `sms` | `email` where relevant */
  channel?: string;
  /** Short human-readable context */
  reason?: string;
  /** Deep-link screen id */
  screen?: MobileNotificationDeepScreen;
  taskId?: string;
  /** Comma-separated lead ids (reminder digest) */
  leadIds?: string;
  reminderCount?: string;
};

/** Row shape for `GET /api/mobile/notifications` (agent inbox). */
export type MobileAgentInboxNotificationDto = {
  id: string;
  type: "hot_lead" | "missed_call" | "reminder" | "new_lead";
  priority: "high" | "medium" | "low";
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  push_sent_at: string | null;
  data: {
    deep_link?: {
      screen: MobileNotificationDeepScreen;
      contact_id?: ContactId;
      task_id?: string;
    };
  } | null;
};

export type MobileNotificationsListResponseDto = {
  notifications: MobileAgentInboxNotificationDto[];
};

export type MobileNotificationPreferencesDto = {
  push_hot_lead: boolean;
  push_missed_call: boolean;
  push_reminder: boolean;
  /** Generate Leads post-engagement-milestone pings (1/10/50/100/250/500/1000). */
  push_post_milestone: boolean;
  reminder_digest_minutes: number;
};

export type MobileDashboardAlertType =
  | "hot_lead"
  | "overdue_task"
  | "ai_escalation"
  | "unread_message";

export type MobileDashboardPriorityAlert = {
  type: MobileDashboardAlertType;
  leadId?: LeadId;
  title: string;
  subtitle?: string;
  createdAt?: string;
  /** Explainable lead attention score (0–100) when the server enriched this alert. */
  attentionScore?: number;
  attentionPriority?: NotificationPriority;
  /** Top 1–3 reasons for the score (for UI). */
  attentionReasons?: string[];
  deliveryTiming?: NotificationDeliveryTiming;
};

export type MobileDashboardQuickAction = {
  key: string;
  label: string;
};

export type MobileDashboardStats = {
  hotLeads: number;
  unreadMessages: number;
  tasksToday: number;
  appointmentsToday: number;
};

/** `GET /api/mobile/dashboard` — home / overview payload for the agent app. */
export type MobileDashboardResponse = {
  stats: MobileDashboardStats;
  priorityAlerts: MobileDashboardPriorityAlert[];
  quickActions: MobileDashboardQuickAction[];
};

/**
 * Realtor business-expense tracking (Books → Expenses). A realtor's income is
 * commission, so the bookkeeping pain is logging COSTS for taxes. Logging is a
 * natural mobile action — snap a receipt the moment money is spent.
 */
export type MobileExpenseDto = {
  id: string;
  /** YYYY-MM-DD */
  expense_date: string;
  amount: number;
  category: string;
  vendor: string | null;
  notes: string | null;
  /** Public URL of an uploaded receipt image, if any. */
  receipt_url: string | null;
  created_at: string;
};

export type MobileExpenseCategoryTotalDto = {
  category: string;
  total: number;
  count: number;
};

export type MobileExpenseTotalsDto = {
  total: number;
  count: number;
  byCategory: MobileExpenseCategoryTotalDto[];
};

/** `GET /api/mobile/expenses` — recent expenses + this-month / YTD totals. */
export type MobileExpensesResponseDto = {
  expenses: MobileExpenseDto[];
  totals: { month: MobileExpenseTotalsDto; year: MobileExpenseTotalsDto };
  /** Known realtor expense categories (single source of truth from the server). */
  categories: string[];
};

/** Request body for `POST /api/mobile/expenses`. */
export type MobileCreateExpenseRequestDto = {
  amount: number;
  category?: string;
  vendor?: string | null;
  notes?: string | null;
  /** YYYY-MM-DD; defaults to today server-side when omitted. */
  expenseDate?: string | null;
  receiptUrl?: string | null;
};

export type DailyAgendaItemType = "task" | "appointment" | "follow_up";

/** Single row for a daily agenda (tasks + appointments + CRM follow-up touchpoints). */
export type DailyAgendaItem = {
  id: string;
  type: DailyAgendaItemType;
  title: string;
  subtitle?: string;
  /** ISO 8601 — task due, appointment start, or `next_contact_at` for follow-ups. */
  dueAt: string;
  leadId?: LeadId;
  priority?: "low" | "medium" | "high";
  status?: string;
};

/** `GET /api/mobile/daily-agenda` (alias: `GET /api/mobile/agenda`) — merged day view (UTC day unless `date`). */
export type MobileDailyAgendaResponseDto = {
  /** `YYYY-MM-DD` (UTC) this list was built for. */
  agendaDate: string;
  items: DailyAgendaItem[];
};
