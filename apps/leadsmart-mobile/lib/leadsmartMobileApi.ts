import { apiFetch, apiFetchJson } from "@leadsmart/api-client";
import Constants from "expo-constants";
import { Platform } from "react-native";
import type {
  DailyAgendaItem,
  MobileAgentInboxNotificationDto,
  MobileBookingLinkDto,
  MobileCalendarEventDto,
  MobileCalendarEventStatus,
  MobileCalendarProvider,
  MobileDailyAgendaResponseDto,
  MobileDashboardPriorityAlert,
  MobileDashboardQuickAction,
  MobileDashboardResponse,
  MobileDashboardStats,
  MobileEmailAiReplyResponseDto,
  MobileEmailMessageDto,
  MobileExpenseDto,
  MobileExpenseTotalsDto,
  MobileExpensesResponseDto,
  MobileFollowUpReminderDto,
  MobileInboxThreadDto,
  MobileLeadDetailResponseDto,
  MobileLeadPipelineDto,
  MobileLeadTaskDto,
  MobileLeadsListResponseDto,
  MobileNotificationPreferencesDto,
  MobileNotificationsListResponseDto,
  MobilePipelineStageOptionDto,
  MobileRemindersResponseDto,
  MobileSmsAiReplyResponseDto,
  MobileSmsMessageDto,
  MobileTasksGroupedResponseDto,
  MobileTaskPriority,
  MobileTaskStatus,
} from "@leadsmart/shared";
import { getLeadsmartAccessToken, getLeadsmartApiBaseUrl } from "./env";
import { MOBILE_API_PATHS } from "./mobileEndpoints";

type MobileJsonError = {
  ok?: boolean;
  success?: boolean;
  error?: string;
  code?: string;
};

export type MobileApiFailure = {
  ok: false;
  status: number;
  message: string;
  code?: string;
  /** Per-field validation errors (typically only on HTTP 400 from zod-validating routes). */
  details?: Record<string, string[]>;
};

export type MobileInboxSuccess = {
  ok: true;
  threads: MobileInboxThreadDto[];
  generatedAt: string;
};

export type MobileLeadsSuccess = { ok: true } & MobileLeadsListResponseDto;

export type MobileLeadDetailSuccess = { ok: true } & MobileLeadDetailResponseDto;

export type MobileDashboardSuccess = { ok: true } & MobileDashboardResponse;

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

function parseMobileFailure(
  status: number,
  body: unknown,
  fallback: unknown
): MobileApiFailure {
  // `fallback` is typed string by callers, but on a network/unreachable error
  // the underlying client can hand back a non-string (an Error/object). Coerce
  // so `message` is ALWAYS a readable string — otherwise it surfaces downstream
  // (e.g. `new Error(res.message)`) as the literal "[object Object]" in the UI.
  const fallbackStr =
    typeof fallback === "string" && fallback.trim()
      ? fallback
      : fallback instanceof Error && fallback.message.trim()
        ? fallback.message
        : "Request failed. Check your connection and try again.";
  if (body && typeof body === "object") {
    const b = body as MobileJsonError & { details?: unknown };
    const details =
      b.details && typeof b.details === "object" && !Array.isArray(b.details)
        ? (b.details as Record<string, string[]>)
        : undefined;
    return {
      ok: false,
      status,
      message: typeof b.error === "string" && b.error.trim() ? b.error : fallbackStr,
      code: typeof b.code === "string" ? b.code : undefined,
      ...(details ? { details } : {}),
    };
  }
  return { ok: false, status, message: fallbackStr };
}

type MobileConfig = { base: string; token: string };

function requireConfig(): MobileApiFailure | MobileConfig {
  const base = getLeadsmartApiBaseUrl();
  const token = getLeadsmartAccessToken();
  if (!base) {
    return { ok: false, status: 0, message: "Set EXPO_PUBLIC_LEADSMART_API_URL (RealtyBoss API base URL)." };
  }
  if (!token) {
    return {
      ok: false,
      status: 0,
      message:
        "API URL is set, but you are not signed in. Use onboarding / Login with your RealtyBoss email and password (Supabase issues the JWT). Optional dev-only: EXPO_PUBLIC_LEADSMART_ACCESS_TOKEN. Setting EXPO_PUBLIC_LEADSMART_API_URL alone does not authenticate.",
    };
  }
  return { base, token };
}

function isMobileConfig(c: MobileApiFailure | MobileConfig): c is MobileConfig {
  return "base" in c && "token" in c;
}

/**
 * Authenticated GET to a mobile API path; validates `{ ok, success }` envelope when present.
 */
async function mobileGet<T extends MobileJsonError>(path: string): Promise<
  | MobileApiFailure
  | { ok: true; data: T }
> {
  const cfg = requireConfig();
  if (!isMobileConfig(cfg)) return cfg;

  const { base, token } = cfg;
  const res = await apiFetch<T>(`${base}${path}`, {
    method: "GET",
    headers: authHeaders(token),
    credentials: "omit",
  });

  if (!res.ok) {
    return parseMobileFailure(res.status, res.body, res.error);
  }

  const data = res.data;
  if (!data || data.ok === false || data.success === false) {
    return parseMobileFailure(res.status, data, "Request failed");
  }

  return { ok: true, data };
}

async function mobilePost<T extends MobileJsonError>(
  path: string,
  body: Record<string, unknown>
): Promise<MobileApiFailure | { ok: true; data: T }> {
  const cfg = requireConfig();
  if (!isMobileConfig(cfg)) return cfg;

  const { base, token } = cfg;
  const res = await apiFetchJson<T>(`${base}${path}`, body, {
    method: "POST",
    headers: authHeaders(token),
    credentials: "omit",
  });

  if (!res.ok) {
    return parseMobileFailure(res.status, res.body, res.error);
  }

  const data = res.data;
  if (!data || data.ok === false || data.success === false) {
    return parseMobileFailure(res.status, data, "Request failed");
  }

  return { ok: true, data };
}

async function mobilePatch<T extends MobileJsonError>(
  path: string,
  body: Record<string, unknown>
): Promise<MobileApiFailure | { ok: true; data: T }> {
  const cfg = requireConfig();
  if (!isMobileConfig(cfg)) return cfg;

  const { base, token } = cfg;
  const res = await apiFetchJson<T>(`${base}${path}`, body, {
    method: "PATCH",
    headers: authHeaders(token),
    credentials: "omit",
  });

  if (!res.ok) {
    return parseMobileFailure(res.status, res.body, res.error);
  }

  const data = res.data;
  if (!data || data.ok === false || data.success === false) {
    return parseMobileFailure(res.status, data, "Request failed");
  }

  return { ok: true, data };
}

async function mobilePut<T extends MobileJsonError>(
  path: string,
  body: Record<string, unknown>
): Promise<MobileApiFailure | { ok: true; data: T }> {
  const cfg = requireConfig();
  if (!isMobileConfig(cfg)) return cfg;

  const { base, token } = cfg;
  const res = await apiFetchJson<T>(`${base}${path}`, body, {
    method: "PUT",
    headers: authHeaders(token),
    credentials: "omit",
  });

  if (!res.ok) {
    return parseMobileFailure(res.status, res.body, res.error);
  }

  const data = res.data;
  if (!data || data.ok === false || data.success === false) {
    return parseMobileFailure(res.status, data, "Request failed");
  }

  return { ok: true, data };
}

async function mobileDelete<T extends MobileJsonError>(
  path: string
): Promise<MobileApiFailure | { ok: true; data: T }> {
  const cfg = requireConfig();
  if (!isMobileConfig(cfg)) return cfg;

  const { base, token } = cfg;
  const res = await apiFetch<T>(`${base}${path}`, {
    method: "DELETE",
    headers: authHeaders(token),
    credentials: "omit",
  });

  if (!res.ok) {
    return parseMobileFailure(res.status, res.body, res.error);
  }

  const data = res.data;
  if (data && (data.ok === false || data.success === false)) {
    return parseMobileFailure(res.status, data, "Request failed");
  }

  return { ok: true, data: (data ?? ({} as T)) };
}

/**
 * Delete the signed-in agent's LeadSmart account. Revokes Supabase auth and
 * marks the agent row for purge. Apple Guideline 5.1.1(v) / Play account
 * deletion policy — see Settings → Delete account.
 */
export async function deleteMobileAccount(): Promise<
  { ok: true } | MobileApiFailure
> {
  const res = await mobileDelete<MobileJsonError>(MOBILE_API_PATHS.account);
  if (res.ok === false) return res;
  return { ok: true };
}

type InboxJson = MobileJsonError & {
  threads?: MobileInboxThreadDto[];
  generatedAt?: string;
};

export async function fetchMobileInbox(): Promise<MobileInboxSuccess | MobileApiFailure> {
  const res = await mobileGet<InboxJson>(MOBILE_API_PATHS.inbox);
  if (res.ok === false) return res;

  const data = res.data;
  if (!Array.isArray(data.threads)) {
    return { ok: false, status: 200, message: "Invalid inbox response (missing threads)." };
  }

  return {
    ok: true,
    threads: data.threads,
    generatedAt: typeof data.generatedAt === "string" ? data.generatedAt : new Date().toISOString(),
  };
}

type DashboardJson = MobileJsonError & Partial<MobileDashboardResponse>;

function isDashboardStats(x: unknown): x is MobileDashboardStats {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s.hotLeads === "number" &&
    typeof s.unreadMessages === "number" &&
    typeof s.tasksToday === "number" &&
    typeof s.appointmentsToday === "number"
  );
}

function isPriorityAlertItem(x: unknown): x is MobileDashboardPriorityAlert {
  if (!x || typeof x !== "object") return false;
  const a = x as Record<string, unknown>;
  return typeof a.type === "string" && typeof a.title === "string";
}

function isQuickActionItem(x: unknown): x is MobileDashboardQuickAction {
  if (!x || typeof x !== "object") return false;
  const q = x as Record<string, unknown>;
  return typeof q.key === "string" && typeof q.label === "string";
}

export async function fetchMobileDashboard(): Promise<MobileDashboardSuccess | MobileApiFailure> {
  const res = await mobileGet<DashboardJson>(MOBILE_API_PATHS.dashboard);
  if (res.ok === false) return res;

  const data = res.data;
  if (
    !isDashboardStats(data.stats) ||
    !Array.isArray(data.priorityAlerts) ||
    !data.priorityAlerts.every(isPriorityAlertItem) ||
    !Array.isArray(data.quickActions) ||
    !data.quickActions.every(isQuickActionItem)
  ) {
    return { ok: false, status: 200, message: "Invalid dashboard response." };
  }

  return {
    ok: true as const,
    stats: data.stats,
    priorityAlerts: data.priorityAlerts,
    quickActions: data.quickActions,
  };
}

type AgendaJson = MobileJsonError & Partial<MobileDailyAgendaResponseDto>;

function isAgendaItem(x: unknown): x is DailyAgendaItem {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  const t = o.type;
  return (
    typeof o.id === "string" &&
    (t === "task" || t === "appointment" || t === "follow_up") &&
    typeof o.title === "string" &&
    typeof o.dueAt === "string"
  );
}

/** Daily merged agenda (`GET /api/mobile/daily-agenda`). */
export async function fetchMobileDailyAgenda(params?: {
  /** UTC day `YYYY-MM-DD`; omit for today UTC. */
  date?: string;
}): Promise<({ ok: true } & MobileDailyAgendaResponseDto) | MobileApiFailure> {
  const q = new URLSearchParams();
  if (params?.date) q.set("date", params.date);
  const path = q.toString()
    ? `${MOBILE_API_PATHS.dailyAgenda}?${q.toString()}`
    : MOBILE_API_PATHS.dailyAgenda;
  const res = await mobileGet<AgendaJson>(path);
  if (res.ok === false) return res;
  const d = res.data;
  if (typeof d.agendaDate !== "string" || !Array.isArray(d.items) || !d.items.every(isAgendaItem)) {
    return { ok: false, status: 200, message: "Invalid agenda response." };
  }
  return {
    ok: true as const,
    agendaDate: d.agendaDate,
    items: d.items,
  };
}

/** @deprecated Use `fetchMobileDailyAgenda` — same endpoint. */
export const fetchMobileAgenda = fetchMobileDailyAgenda;

type LeadsJson = MobileJsonError & MobileLeadsListResponseDto;

/**
 * Filter keys accepted by `/api/dashboard/leads`. Keep in sync with the
 * web handler at `apps/leadsmartai/app/api/dashboard/leads/route.ts` —
 * the server branches on each of these values, so widening the union
 * here without adding a branch there will silently return the default
 * list. `high_engagement` was previously missing from this type even
 * though the server and the mobile leads screen already supported it,
 * which caused a pre-existing TS error whenever the "Engaged" filter
 * chip was selected.
 */
export type MobileLeadsFilter = "hot" | "inactive" | "high_engagement";

export async function fetchMobileLeads(params: {
  page?: number;
  pageSize?: number;
  filter?: MobileLeadsFilter;
}): Promise<MobileLeadsSuccess | MobileApiFailure> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 30;
  const q = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (params.filter) q.set("filter", params.filter);

  const res = await mobileGet<LeadsJson>(`${MOBILE_API_PATHS.leads}?${q.toString()}`);
  if (res.ok === false) return res;

  const data = res.data;
  if (!Array.isArray(data.leads)) {
    return { ok: false, status: 200, message: "Invalid leads response." };
  }

  return {
    ok: true as const,
    leads: data.leads,
    total: Number(data.total) || 0,
    page: Number(data.page) || page,
    pageSize: Number(data.pageSize) || pageSize,
  };
}

/** Server response shape from POST /api/mobile/contacts/intake. */
type CreateContactJson = MobileJsonError & {
  leadId?: string;
  action?: string;
  details?: Record<string, string[]>;
  code?: string;
  duplicate?: { leadId?: string; score?: number; reasons?: unknown };
};

export type CreateMobileContactInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  property_address?: string | null;
  notes?: string | null;
  /** Force-create past a duplicate match. */
  forceCreate?: boolean;
};

export type CreateMobileContactResult =
  | { ok: true; leadId: string }
  | MobileApiFailure;

/**
 * Create a contact from the mobile app via the shared intake pipeline.
 * Mirrors what `/dashboard/leads/add` does on the web side but routed
 * through `/api/mobile/contacts/intake` with mobile bearer-token auth.
 *
 * On validation failure (HTTP 400) the per-field zod error map is
 * preserved on the returned `MobileApiFailure.details` so the form
 * can render inline errors next to the offending input.
 */
export async function createMobileContact(
  input: CreateMobileContactInput
): Promise<CreateMobileContactResult> {
  const res = await mobilePost<CreateContactJson>(MOBILE_API_PATHS.contactsIntake, {
    name: input.name ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    property_address: input.property_address ?? null,
    notes: input.notes ?? null,
    source: "mobile_app",
    forceCreate: input.forceCreate ?? false,
  });

  if (res.ok === false) return res;

  const leadId = res.data.leadId;
  if (!leadId) {
    return { ok: false, status: 200, message: "Invalid create-contact response." };
  }

  return { ok: true, leadId: String(leadId) };
}

type LeadDetailJson = MobileJsonError & Partial<MobileLeadDetailResponseDto> & {
  lead?: MobileLeadDetailResponseDto["lead"];
  conversations?: MobileLeadDetailResponseDto["conversations"];
};

const emptyPipeline: MobileLeadPipelineDto = {
  stage_id: null,
  mobile_slug: null,
  name: null,
};

export async function fetchMobileLeadDetail(
  leadId: string
): Promise<MobileLeadDetailSuccess | MobileApiFailure> {
  const res = await mobileGet<LeadDetailJson>(MOBILE_API_PATHS.lead(leadId));
  if (res.ok === false) return res;

  const data = res.data;
  if (!data.lead || !data.conversations) {
    return { ok: false, status: 200, message: "Invalid lead detail response." };
  }

  const pipeline_stages: MobilePipelineStageOptionDto[] = Array.isArray(data.pipeline_stages)
    ? data.pipeline_stages
    : [];

  const booking_links: MobileBookingLinkDto[] = Array.isArray(data.booking_links)
    ? data.booking_links
    : [];

  return {
    ok: true as const,
    lead: data.lead,
    conversations: data.conversations,
    pipeline: data.pipeline ?? emptyPipeline,
    pipeline_stages,
    next_open_task: data.next_open_task ?? null,
    next_appointment: data.next_appointment ?? null,
    booking_links,
  };
}

type PushRegisterJson = MobileJsonError & { ok?: boolean; success?: boolean };

/**
 * Register this device’s Expo push token with LeadSmart AI (`POST /api/mobile/push/register`).
 */
export async function registerMobileExpoPushToken(
  expoPushToken: string
): Promise<{ ok: true } | MobileApiFailure> {
  const cfg = requireConfig();
  if (!isMobileConfig(cfg)) return cfg;

  const { base, token } = cfg;
  const platform =
    Platform.OS === "ios"
      ? "ios"
      : Platform.OS === "android"
        ? "android"
        : Platform.OS === "web"
          ? "web"
          : "unknown";

  const res = await apiFetchJson<PushRegisterJson>(
    `${base}${MOBILE_API_PATHS.pushRegister}`,
    {
      expoPushToken,
      platform,
      appVersion: Constants.expoConfig?.version ?? undefined,
    },
    { method: "POST", headers: authHeaders(token), credentials: "omit" }
  );

  if (!res.ok) {
    return parseMobileFailure(res.status, res.body, res.error);
  }

  const data = res.data;
  if (!data || data.ok === false || data.success === false) {
    return parseMobileFailure(res.status, data, "Push registration failed");
  }

  return { ok: true as const };
}

type SmsSendJson = MobileJsonError & { message?: MobileSmsMessageDto };
type EmailSendJson = MobileJsonError & { message?: MobileEmailMessageDto };
type SmsAiJson = MobileJsonError & MobileSmsAiReplyResponseDto;
type EmailAiJson = MobileJsonError & MobileEmailAiReplyResponseDto;

export async function postMobileSmsSend(
  leadId: string,
  body: string
): Promise<{ ok: true; message: MobileSmsMessageDto } | MobileApiFailure> {
  const res = await mobilePost<SmsSendJson>(MOBILE_API_PATHS.leadSmsSend(leadId), { body });
  if (res.ok === false) return res;
  const m = res.data.message;
  if (!m || typeof m.id !== "string") {
    return { ok: false, status: 200, message: "Invalid SMS send response." };
  }
  return { ok: true, message: m };
}

export async function postMobileEmailSend(
  leadId: string,
  params: { subject: string; body: string }
): Promise<{ ok: true; message: MobileEmailMessageDto } | MobileApiFailure> {
  const res = await mobilePost<EmailSendJson>(MOBILE_API_PATHS.leadEmailSend(leadId), {
    subject: params.subject,
    body: params.body,
  });
  if (res.ok === false) return res;
  const m = res.data.message;
  if (!m || typeof m.id !== "string") {
    return { ok: false, status: 200, message: "Invalid email send response." };
  }
  return { ok: true, message: m };
}

export async function postMobileSmsAiReply(
  leadId: string
): Promise<{ ok: true; suggestion: string } | MobileApiFailure> {
  const res = await mobilePost<SmsAiJson>(MOBILE_API_PATHS.leadSmsAiReply(leadId), {});
  if (res.ok === false) return res;
  const s = res.data.suggestion;
  if (typeof s !== "string" || !s.trim()) {
    return { ok: false, status: 200, message: "Invalid SMS AI response." };
  }
  return { ok: true, suggestion: s.trim() };
}

export async function postMobileEmailAiReply(
  leadId: string
): Promise<{ ok: true; subject: string; body: string } | MobileApiFailure> {
  const res = await mobilePost<EmailAiJson>(MOBILE_API_PATHS.leadEmailAiReply(leadId), {});
  if (res.ok === false) return res;
  const subject = String(res.data.subject ?? "").trim();
  const body = String(res.data.body ?? "").trim();
  if (!body) {
    return { ok: false, status: 200, message: "Invalid email AI response." };
  }
  return { ok: true, subject: subject || "Following up", body };
}

type TasksGroupedJson = MobileJsonError & Partial<MobileTasksGroupedResponseDto>;

function isTaskList(x: unknown): x is MobileLeadTaskDto[] {
  return Array.isArray(x);
}

export async function fetchMobileTasks(): Promise<
  ({ ok: true } & MobileTasksGroupedResponseDto) | MobileApiFailure
> {
  const res = await mobileGet<TasksGroupedJson>(MOBILE_API_PATHS.tasks);
  if (res.ok === false) return res;

  const data = res.data;
  if (
    !isTaskList(data.overdue) ||
    !isTaskList(data.today) ||
    !isTaskList(data.upcoming) ||
    !Array.isArray(data.stages)
  ) {
    return { ok: false, status: 200, message: "Invalid tasks response." };
  }

  return {
    ok: true as const,
    stages: data.stages as MobilePipelineStageOptionDto[],
    overdue: data.overdue,
    today: data.today,
    upcoming: data.upcoming,
  };
}

type TaskMutationJson = MobileJsonError & { task?: MobileLeadTaskDto };

export async function postMobileTask(params: {
  lead_id: string;
  title: string;
  description?: string | null;
  due_at?: string | null;
  priority?: MobileTaskPriority;
  task_type?: string | null;
}): Promise<{ ok: true; task: MobileLeadTaskDto } | MobileApiFailure> {
  const res = await mobilePost<TaskMutationJson>(MOBILE_API_PATHS.tasks, {
    lead_id: params.lead_id,
    title: params.title,
    description: params.description ?? null,
    due_at: params.due_at ?? null,
    priority: params.priority ?? "medium",
    task_type: params.task_type ?? null,
  });
  if (res.ok === false) return res;
  const task = res.data.task;
  if (!task || typeof task.id !== "string") {
    return { ok: false, status: 200, message: "Invalid create task response." };
  }
  return { ok: true, task };
}

export async function patchMobileTask(
  taskId: string,
  patch: {
    status?: MobileTaskStatus;
    title?: string;
    description?: string | null;
    due_at?: string | null;
    priority?: MobileTaskPriority;
  }
): Promise<{ ok: true; task: MobileLeadTaskDto } | MobileApiFailure> {
  const res = await mobilePatch<TaskMutationJson>(MOBILE_API_PATHS.task(taskId), patch);
  if (res.ok === false) return res;
  const task = res.data.task;
  if (!task || typeof task.id !== "string") {
    return { ok: false, status: 200, message: "Invalid update task response." };
  }
  return { ok: true, task };
}

type PipelineStagePatchJson = MobileJsonError & { pipeline_stage_id?: string | null };

export async function patchLeadPipelineStage(
  leadId: string,
  body: { stage_slug: string } | { pipeline_stage_id: string | null }
): Promise<{ ok: true; pipeline_stage_id: string | null } | MobileApiFailure> {
  const res = await mobilePatch<PipelineStagePatchJson>(
    MOBILE_API_PATHS.leadPipelineStage(leadId),
    body as Record<string, unknown>
  );
  if (res.ok === false) return res;
  const id = res.data.pipeline_stage_id;
  return {
    ok: true as const,
    pipeline_stage_id: id === undefined || id === null ? null : String(id),
  };
}

type CalendarEventsJson = MobileJsonError & { events?: MobileCalendarEventDto[] };
type CalendarEventMutationJson = MobileJsonError & { event?: MobileCalendarEventDto };
type BookingLinkJson = MobileJsonError & { booking_link?: MobileBookingLinkDto };
type RemindersJson = MobileJsonError & Partial<MobileRemindersResponseDto>;

function isEventList(x: unknown): x is MobileCalendarEventDto[] {
  return Array.isArray(x);
}

export async function fetchMobileCalendarEvents(params?: {
  from?: string;
  to?: string;
}): Promise<{ ok: true; events: MobileCalendarEventDto[] } | MobileApiFailure> {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const path = q.toString()
    ? `${MOBILE_API_PATHS.calendarEvents}?${q.toString()}`
    : MOBILE_API_PATHS.calendarEvents;
  const res = await mobileGet<CalendarEventsJson>(path);
  if (res.ok === false) return res;
  if (!isEventList(res.data.events)) {
    return { ok: false, status: 200, message: "Invalid calendar events response." };
  }
  return { ok: true as const, events: res.data.events };
}

export async function postMobileCalendarEvent(body: {
  lead_id: string;
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at?: string | null;
  timezone?: string | null;
  calendar_provider?: MobileCalendarProvider | null;
}): Promise<{ ok: true; event: MobileCalendarEventDto } | MobileApiFailure> {
  const res = await mobilePost<CalendarEventMutationJson>(MOBILE_API_PATHS.calendarEvents, {
    lead_id: body.lead_id,
    title: body.title,
    description: body.description ?? null,
    starts_at: body.starts_at,
    ends_at: body.ends_at ?? null,
    timezone: body.timezone ?? null,
    calendar_provider: body.calendar_provider ?? "local",
  });
  if (res.ok === false) return res;
  const ev = res.data.event;
  if (!ev || typeof ev.id !== "string") {
    return { ok: false, status: 200, message: "Invalid create event response." };
  }
  return { ok: true, event: ev };
}

export async function patchMobileCalendarEvent(
  eventId: string,
  patch: {
    status?: MobileCalendarEventStatus;
    title?: string;
    description?: string | null;
    starts_at?: string;
    ends_at?: string | null;
  }
): Promise<{ ok: true; event: MobileCalendarEventDto } | MobileApiFailure> {
  const res = await mobilePatch<CalendarEventMutationJson>(
    MOBILE_API_PATHS.calendarEvent(eventId),
    patch as Record<string, unknown>
  );
  if (res.ok === false) return res;
  const ev = res.data.event;
  if (!ev || typeof ev.id !== "string") {
    return { ok: false, status: 200, message: "Invalid update event response." };
  }
  return { ok: true, event: ev };
}

export async function postMobileBookingLink(params: {
  lead_id: string;
  booking_url: string;
  label?: string | null;
  share_message?: string | null;
  expires_at?: string | null;
}): Promise<{ ok: true; booking_link: MobileBookingLinkDto } | MobileApiFailure> {
  const res = await mobilePost<BookingLinkJson>(MOBILE_API_PATHS.calendarBookingLink, {
    lead_id: params.lead_id,
    booking_url: params.booking_url,
    label: params.label ?? null,
    share_message: params.share_message ?? null,
    expires_at: params.expires_at ?? null,
  });
  if (res.ok === false) return res;
  const link = res.data.booking_link;
  if (!link || typeof link.id !== "string") {
    return { ok: false, status: 200, message: "Invalid booking link response." };
  }
  return { ok: true, booking_link: link };
}

export async function fetchMobileReminders(): Promise<
  ({ ok: true } & MobileRemindersResponseDto) | MobileApiFailure
> {
  const res = await mobileGet<RemindersJson>(MOBILE_API_PATHS.reminders);
  if (res.ok === false) return res;
  const d = res.data;
  if (
    !isEventList(d.upcoming_appointments) ||
    !isTaskList(d.overdue_tasks) ||
    !Array.isArray(d.follow_ups)
  ) {
    return { ok: false, status: 200, message: "Invalid reminders response." };
  }
  return {
    ok: true as const,
    upcoming_appointments: d.upcoming_appointments,
    overdue_tasks: d.overdue_tasks,
    follow_ups: d.follow_ups as MobileFollowUpReminderDto[],
  };
}

type NotificationsListJson = MobileJsonError & Partial<MobileNotificationsListResponseDto>;

export async function fetchMobileNotifications(params?: {
  limit?: number;
}): Promise<({ ok: true } & MobileNotificationsListResponseDto) | MobileApiFailure> {
  const q =
    typeof params?.limit === "number"
      ? `?limit=${encodeURIComponent(String(params.limit))}`
      : "";
  const res = await mobileGet<NotificationsListJson>(`${MOBILE_API_PATHS.notifications}${q}`);
  if (res.ok === false) return res;
  const list = res.data.notifications;
  if (!Array.isArray(list)) {
    return { ok: false, status: 200, message: "Invalid notifications response." };
  }
  return { ok: true, notifications: list as MobileAgentInboxNotificationDto[] };
}

export async function postMobileNotificationRead(params: {
  notificationId?: string;
  markAllRead?: boolean;
}): Promise<{ ok: true } | MobileApiFailure> {
  const body: Record<string, unknown> = {};
  if (params.markAllRead) body.markAllRead = true;
  else if (params.notificationId) body.notificationId = params.notificationId;
  else return { ok: false, status: 0, message: "notificationId or markAllRead required." };

  const res = await mobilePost<MobileJsonError>(MOBILE_API_PATHS.notifications, body);
  if (res.ok === false) return res;
  return { ok: true };
}

type PrefsJson = MobileJsonError & { preferences?: MobileNotificationPreferencesDto };

export async function fetchMobileNotificationPreferences(): Promise<
  ({ ok: true } & { preferences: MobileNotificationPreferencesDto }) | MobileApiFailure
> {
  const res = await mobileGet<PrefsJson>(MOBILE_API_PATHS.notificationPreferences);
  if (res.ok === false) return res;
  const p = res.data.preferences;
  if (!p || typeof p.push_hot_lead !== "boolean") {
    return { ok: false, status: 200, message: "Invalid notification preferences response." };
  }
  return { ok: true, preferences: p };
}

export async function patchMobileNotificationPreferences(
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
): Promise<({ ok: true } & { preferences: MobileNotificationPreferencesDto }) | MobileApiFailure> {
  const res = await mobilePatch<PrefsJson>(MOBILE_API_PATHS.notificationPreferences, patch);
  if (res.ok === false) return res;
  const p = res.data.preferences;
  if (!p) {
    return { ok: false, status: 200, message: "Invalid notification preferences response." };
  }
  return { ok: true, preferences: p };
}

// ── Expenses (Books → realtor business-cost tracking) ────────────
//
// A realtor's income is commission, so the bookkeeping pain is
// logging COSTS for taxes. Logging is a natural mobile action —
// snap a receipt the moment money is spent. Mirrors
// /api/mobile/expenses (list + create + delete) and
// /api/mobile/expenses/receipt (multipart receipt-photo upload).

type ExpensesListJson = MobileJsonError & Partial<MobileExpensesResponseDto>;

export type MobileExpensesSuccess = {
  ok: true;
  expenses: MobileExpenseDto[];
  totals: { month: MobileExpenseTotalsDto; year: MobileExpenseTotalsDto };
  categories: string[];
};

const emptyTotals: MobileExpenseTotalsDto = { total: 0, count: 0, byCategory: [] };

export async function fetchMobileExpenses(): Promise<MobileExpensesSuccess | MobileApiFailure> {
  const res = await mobileGet<ExpensesListJson>(MOBILE_API_PATHS.expenses);
  if (res.ok === false) return res;
  const d = res.data;
  if (!Array.isArray(d.expenses)) {
    return { ok: false, status: 200, message: "Invalid expenses response." };
  }
  return {
    ok: true,
    expenses: d.expenses,
    totals: {
      month: d.totals?.month ?? emptyTotals,
      year: d.totals?.year ?? emptyTotals,
    },
    categories: Array.isArray(d.categories) ? d.categories : [],
  };
}

export type CreateMobileExpenseInput = {
  amount: number;
  category?: string;
  vendor?: string | null;
  notes?: string | null;
  expenseDate?: string | null;
  receiptUrl?: string | null;
};

export async function postMobileExpense(
  input: CreateMobileExpenseInput
): Promise<{ ok: true; id: string } | MobileApiFailure> {
  const res = await mobilePost<MobileJsonError & { id?: string }>(MOBILE_API_PATHS.expenses, {
    amount: input.amount,
    category: input.category ?? null,
    vendor: input.vendor ?? null,
    notes: input.notes ?? null,
    expenseDate: input.expenseDate ?? null,
    receiptUrl: input.receiptUrl ?? null,
  });
  if (res.ok === false) return res;
  const id = res.data.id;
  if (!id) return { ok: false, status: 200, message: "Invalid create-expense response." };
  return { ok: true, id: String(id) };
}

export async function deleteMobileExpense(
  id: string
): Promise<{ ok: true } | MobileApiFailure> {
  const res = await mobilePost<MobileJsonError>(MOBILE_API_PATHS.expensesDelete, { id });
  if (res.ok === false) return res;
  return { ok: true };
}

/**
 * Upload a receipt photo for an expense. Multipart POST (same pattern
 * as uploadMobileMedia) — returns a stable public URL the caller
 * passes to postMobileExpense as `receiptUrl`. Best-effort: callers
 * should still log the expense if this fails.
 */
export async function uploadMobileReceipt(input: {
  /** Local file URI from expo-image-picker. */
  uri: string;
  fileName?: string;
  contentType?: string;
}): Promise<{ ok: true; url: string } | MobileApiFailure> {
  const cfg = requireConfig();
  if (!isMobileConfig(cfg)) return cfg;
  const { base, token } = cfg;

  const fileName =
    input.fileName || input.uri.split("/").pop() || `receipt-${Date.now()}.jpg`;
  const mime = (input.contentType ?? "image/jpeg").toLowerCase();

  const form = new FormData();
  form.append(
    "file",
    { uri: input.uri, name: fileName, type: mime } as unknown as Blob,
  );

  try {
    const res = await fetch(`${base}${MOBILE_API_PATHS.expenseReceiptUpload}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      body: form,
    });
    const body = (await res.json().catch(() => ({}))) as MobileJsonError & { url?: string };
    if (!res.ok || body.ok === false || body.success === false) {
      return parseMobileFailure(res.status, body, body.error ?? "Upload failed");
    }
    if (!body.url) return { ok: false, status: 500, message: "Upload returned no URL" };
    return { ok: true, url: body.url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    return { ok: false, status: 0, message: msg };
  }
}

// ── Lead Queue ──

type QueueLead = {
  id: string | number;
  name: string | null;
  email: string | null;
  phone: string | null;
  property_address: string | null;
  source: string | null;
  created_at: string;
};

export async function fetchLeadQueue(): Promise<
  ({ ok: true } & { leads: QueueLead[]; total: number }) | MobileApiFailure
> {
  const res = await mobileGet<{ ok: boolean; leads: QueueLead[]; total: number }>(
    `${MOBILE_API_PATHS.leadQueue}?pageSize=30`
  );
  if (res.ok === false) return res;
  return { ok: true, leads: res.data.leads ?? [], total: res.data.total ?? 0 };
}

export async function claimQueueLead(
  leadId: string
): Promise<({ ok: true } & { leadId: string }) | MobileApiFailure> {
  const res = await mobilePost<{ ok: boolean; leadId?: string; error?: string }>(
    MOBILE_API_PATHS.leadQueueClaim,
    { leadId }
  );
  if (res.ok === false) return res;
  if (!res.data.ok) return { ok: false, status: 200, message: res.data.error ?? "Claim failed" };
  return { ok: true, leadId: String(res.data.leadId ?? leadId) };
}

// ── CMA ───────────────────────────────────────────────────────────
//
// Mobile mirror of /api/mobile/cma. The web flow doesn't persist
// CMA reports — each generation is a fresh computation against the
// property warehouse + comps. So this is a single POST + render
// surface, not a list/detail flow.

export type MobileCmaSubject = {
  address: string;
  beds: number;
  baths: number;
  sqft: number;
  propertyType: string | null;
  yearBuilt: number;
  condition: string;
};

export type MobileCmaComp = {
  address: string;
  price: number;
  sqft: number;
  beds: number | null;
  baths: number | null;
  distanceMiles: number;
  soldDate: string;
  propertyType: string | null;
  pricePerSqft: number;
};

export type MobileCmaStrategies = {
  aggressive: number;
  market: number;
  premium: number;
  daysOnMarket: { aggressive: number; market: number; premium: number };
};

export type MobileCmaReport = {
  summary: string;
  subject: MobileCmaSubject;
  comps: MobileCmaComp[];
  avgPricePerSqft: number;
  estimatedValue: number;
  low: number;
  high: number;
  strategies: MobileCmaStrategies;
};

type CmaJson = MobileJsonError &
  Partial<MobileCmaReport> & {
    usage?: { reached?: boolean; remaining?: number; limit?: number };
  };

export async function generateMobileCma(input: {
  address: string;
  sqft?: number | null;
  condition?: string | null;
}): Promise<({ ok: true } & MobileCmaReport) | MobileApiFailure> {
  const res = await mobilePost<CmaJson>(MOBILE_API_PATHS.cma, {
    address: input.address,
    sqft: input.sqft ?? undefined,
    condition: input.condition ?? undefined,
  });
  if (res.ok === false) return res;
  const d = res.data;
  if (!d.subject || !Array.isArray(d.comps)) {
    return { ok: false, status: 200, message: "Invalid CMA response." };
  }
  return {
    ok: true,
    summary: d.summary ?? "",
    subject: d.subject,
    comps: d.comps,
    avgPricePerSqft: Number(d.avgPricePerSqft ?? 0),
    estimatedValue: Number(d.estimatedValue ?? 0),
    low: Number(d.low ?? 0),
    high: Number(d.high ?? 0),
    strategies: d.strategies ?? {
      aggressive: 0,
      market: 0,
      premium: 0,
      daysOnMarket: { aggressive: 0, market: 0, premium: 0 },
    },
  };
}

// ── Coaching ──────────────────────────────────────────────────────
//
// Mobile mirror of /api/mobile/coaching/me. The wire shape matches
// /api/coaching/me on the web — keep these types in sync with
// COACHING_PROGRAMS in apps/leadsmartai/lib/coaching-programs/programs.ts.

export type MobileCoachingProgramSlug =
  | "producer_track"
  | "top_producer_track";

export type MobileCoachingProgramStatus =
  | "enrolled"
  | "opted_out"
  | "eligible_not_enrolled"
  | "not_eligible";

export type MobileCoachingPlan =
  | "starter"
  | "growth"
  | "elite"
  | "team"
  | null;

export type MobileCoachingProgram = {
  slug: MobileCoachingProgramSlug;
  status: MobileCoachingProgramStatus;
  enrolledAt: string | null;
  meta: {
    name: string;
    tagline: string;
    annualTransactionTarget: number;
    conversionRateTargetPct: number;
  };
};

type CoachingJson = MobileJsonError & {
  plan?: MobileCoachingPlan;
  programs?: MobileCoachingProgram[];
};

export async function fetchMobileCoaching(): Promise<
  | ({ ok: true } & { plan: MobileCoachingPlan; programs: MobileCoachingProgram[] })
  | MobileApiFailure
> {
  const res = await mobileGet<CoachingJson>(MOBILE_API_PATHS.coaching);
  if (res.ok === false) return res;
  return {
    ok: true,
    plan: res.data.plan ?? null,
    programs: res.data.programs ?? [],
  };
}

// ── Postcards ─────────────────────────────────────────────────────
//
// Mobile mirrors of /api/mobile/postcards/*. Wire shape declared
// inline; keep in sync with apps/leadsmartai/lib/postcards/types.ts.

export type MobilePostcardTemplateKey =
  | "birthday"
  | "anniversary"
  | "holiday_seasonal"
  | "thinking_of_you";

export type MobilePostcardChannel = "email" | "sms" | "wechat";

export type MobilePostcardTemplate = {
  key: MobilePostcardTemplateKey;
  title: string;
  tagline: string;
  suggestedWhen: string;
  defaultMessage: string;
  accentColor: string;
  emojiBadge: string;
};

export type MobilePostcardSend = {
  id: string;
  agent_id: string;
  contact_id: string | null;
  template_key: MobilePostcardTemplateKey;
  slug: string;
  recipient_name: string;
  recipient_email: string | null;
  recipient_phone: string | null;
  personal_message: string | null;
  channels: string[];
  email_sent_at: string | null;
  sms_sent_at: string | null;
  wechat_sent_at: string | null;
  email_error: string | null;
  sms_error: string | null;
  wechat_error: string | null;
  opened_at: string | null;
  open_count: number;
  created_at: string;
  updated_at: string;
};

type PostcardTemplatesJson = MobileJsonError & {
  templates?: MobilePostcardTemplate[];
};
type PostcardsListJson = MobileJsonError & {
  postcards?: MobilePostcardSend[];
};
type PostcardSendJson = MobileJsonError & {
  send?: MobilePostcardSend;
  publicUrl?: string;
  deliveries?: Record<string, { ok: boolean; reason?: string }>;
};

export async function fetchMobilePostcardTemplates(): Promise<
  ({ ok: true } & { templates: MobilePostcardTemplate[] }) | MobileApiFailure
> {
  const res = await mobileGet<PostcardTemplatesJson>(
    MOBILE_API_PATHS.postcardTemplates,
  );
  if (res.ok === false) return res;
  return { ok: true, templates: res.data.templates ?? [] };
}

export async function fetchMobilePostcards(opts?: {
  contactId?: string;
  limit?: number;
}): Promise<({ ok: true } & { postcards: MobilePostcardSend[] }) | MobileApiFailure> {
  const q = new URLSearchParams();
  if (opts?.contactId) q.set("contactId", opts.contactId);
  if (opts?.limit) q.set("limit", String(opts.limit));
  const path = q.toString()
    ? `${MOBILE_API_PATHS.postcards}?${q.toString()}`
    : MOBILE_API_PATHS.postcards;
  const res = await mobileGet<PostcardsListJson>(path);
  if (res.ok === false) return res;
  return { ok: true, postcards: res.data.postcards ?? [] };
}

export type MobileSendPostcardInput = {
  templateKey: MobilePostcardTemplateKey;
  recipientName: string;
  channels: MobilePostcardChannel[];
  contactId?: string | null;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  personalMessage?: string | null;
};

export async function sendMobilePostcard(
  input: MobileSendPostcardInput,
): Promise<
  | ({ ok: true } & {
      send: MobilePostcardSend;
      publicUrl: string;
      deliveries: Record<string, { ok: boolean; reason?: string }>;
    })
  | MobileApiFailure
> {
  const res = await mobilePost<PostcardSendJson>(
    MOBILE_API_PATHS.postcards,
    input as unknown as Record<string, unknown>,
  );
  if (res.ok === false) return res;
  if (!res.data.send) {
    return { ok: false, status: 500, message: "Postcard send returned no row" };
  }
  return {
    ok: true,
    send: res.data.send,
    publicUrl: res.data.publicUrl ?? "",
    deliveries: res.data.deliveries ?? {},
  };
}

// ── Showings ──────────────────────────────────────────────────────
//
// Mobile mirrors of /api/mobile/showings/*. The shared packages don't
// have showings DTOs yet, so we declare the wire shape inline here —
// mirrors lib/showings/types.ts on the dashboard. When the shared
// package gets a `MobileShowingDto`, replace these with imports.

export type MobileShowingStatus = "scheduled" | "attended" | "cancelled" | "no_show";
export type MobileShowingReaction = "love" | "like" | "maybe" | "pass";

export type MobileShowingListItem = {
  id: string;
  agent_id: string;
  contact_id: string;
  property_address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  mls_number: string | null;
  scheduled_at: string;
  status: MobileShowingStatus;
  access_notes: string | null;
  notes: string | null;
  contact_name: string | null;
  feedback_rating: number | null;
  feedback_reaction: MobileShowingReaction | null;
  feedback_would_offer: boolean | null;
  created_at: string;
  updated_at: string;
};

export type MobileShowingFeedback = {
  id: string;
  showing_id: string;
  rating: number | null;
  overall_reaction: MobileShowingReaction | null;
  would_offer: boolean | null;
  price_concerns: boolean | null;
  location_concerns: boolean | null;
  condition_concerns: boolean | null;
  pros: string | null;
  cons: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MobileShowingDetail = {
  showing: MobileShowingListItem;
  feedback: MobileShowingFeedback | null;
  contactName: string | null;
};

export async function fetchMobileShowings(opts?: {
  contactId?: string;
}): Promise<({ ok: true } & { showings: MobileShowingListItem[] }) | MobileApiFailure> {
  const path = opts?.contactId
    ? `${MOBILE_API_PATHS.showings}?contactId=${encodeURIComponent(opts.contactId)}`
    : MOBILE_API_PATHS.showings;
  const res = await mobileGet<{ showings?: MobileShowingListItem[] }>(path);
  if (res.ok === false) return res;
  return { ok: true, showings: res.data.showings ?? [] };
}

export async function fetchMobileShowingDetail(
  id: string,
): Promise<({ ok: true } & MobileShowingDetail) | MobileApiFailure> {
  const res = await mobileGet<{
    showing?: MobileShowingListItem;
    feedback?: MobileShowingFeedback | null;
    contactName?: string | null;
  }>(MOBILE_API_PATHS.showing(id));
  if (res.ok === false) return res;
  if (!res.data.showing) {
    return { ok: false, status: 404, message: "Showing not found" };
  }
  return {
    ok: true,
    showing: res.data.showing,
    feedback: res.data.feedback ?? null,
    contactName: res.data.contactName ?? null,
  };
}

export async function updateMobileShowingStatus(
  id: string,
  status: MobileShowingStatus,
): Promise<({ ok: true } & { showing: MobileShowingListItem }) | MobileApiFailure> {
  const res = await mobilePatch<{ showing?: MobileShowingListItem }>(
    MOBILE_API_PATHS.showing(id),
    { status },
  );
  if (res.ok === false) return res;
  if (!res.data.showing) {
    return { ok: false, status: 500, message: "Update returned no row" };
  }
  return { ok: true, showing: res.data.showing };
}

export type MobileShowingFeedbackInput = Partial<{
  rating: number;
  overall_reaction: MobileShowingReaction;
  would_offer: boolean;
  price_concerns: boolean;
  location_concerns: boolean;
  condition_concerns: boolean;
  pros: string;
  cons: string;
  notes: string;
}>;

export async function upsertMobileShowingFeedback(
  showingId: string,
  input: MobileShowingFeedbackInput,
): Promise<({ ok: true } & { feedback: MobileShowingFeedback }) | MobileApiFailure> {
  const res = await mobilePut<{ feedback?: MobileShowingFeedback }>(
    MOBILE_API_PATHS.showingFeedback(showingId),
    input as Record<string, unknown>,
  );
  if (res.ok === false) return res;
  if (!res.data.feedback) {
    return { ok: false, status: 500, message: "Feedback save returned no row" };
  }
  return { ok: true, feedback: res.data.feedback };
}

// ── Click-to-Call (Twilio bridge) ──────────────────────────────────
//
// Mirrors /api/voice/click-to-call. Server bridges the agent's phone to
// the contact's via Twilio: the agent's device rings first, then the
// contact's leg is dialed and joined. Logged to lead_calls.

type ClickToCallJson = MobileJsonError & {
  callId?: string;
  twilioCallSid?: string;
};

export type MobileClickToCallSuccess = {
  ok: true;
  callId?: string;
  twilioCallSid?: string;
};

export async function postMobileClickToCall(
  contactId: string,
): Promise<MobileClickToCallSuccess | MobileApiFailure> {
  const res = await mobilePost<ClickToCallJson>(MOBILE_API_PATHS.clickToCall, {
    contactId,
  });
  if (res.ok === false) return res;
  return {
    ok: true,
    callId: res.data.callId,
    twilioCallSid: res.data.twilioCallSid,
  };
}

// ── Daily Briefings (☀️ morning + 🌙 evening) ──────────────────────
//
// Mirrors /api/dashboard/briefings. The mobile home screen shows the
// latest of each kind, no history pager — keeps the small screen
// focused on what's current.

export type MobileBriefingKind = "morning" | "evening";

export type MobileBriefingInsights = {
  topHotLeads?: Array<{ name: string; score: number; address: string }>;
  needsFollowUp?: Array<{ name: string; daysInactive: number; address: string }>;
  completedTasks?: Array<{ title: string; type: string }>;
  missedTasks?: Array<{ title: string; type: string }>;
  tomorrowTasks?: Array<{ title: string; type: string }>;
  topOpportunity?: string;
  suggestedActions?: string[];
};

export type MobileBriefing = {
  id: string;
  kind: MobileBriefingKind;
  headline: string | null;
  summary: string;
  insights: MobileBriefingInsights;
  created_at: string;
};

type BriefingsJson = MobileJsonError & {
  morning?: MobileBriefing[];
  evening?: MobileBriefing[];
};

export async function fetchMobileBriefings(): Promise<
  | ({ ok: true } & { morning: MobileBriefing[]; evening: MobileBriefing[] })
  | MobileApiFailure
> {
  const res = await mobileGet<BriefingsJson>(MOBILE_API_PATHS.briefings);
  if (res.ok === false) return res;
  return {
    ok: true,
    morning: res.data.morning ?? [],
    evening: res.data.evening ?? [],
  };
}


// ── Generate Leads (mobile Quick Post) ───────────────────────────

export type MobileQuickPostTrigger =
  | "new_listing"
  | "open_house"
  | "price_drop"
  | "just_sold"
  | "market_update"
  | "testimonial"
  | "custom"
  | "by_address";

export type MobileQuickPostPlatform =
  | "facebook"
  | "instagram"
  | "linkedin"
  | "x";

type MobileQuickPostDraftJson = MobileJsonError & {
  caption?: string;
  hashtags?: string[];
};

export type MobileQuickPostDraftSuccess = {
  ok: true;
  caption: string;
  hashtags: string[];
};

/**
 * Generate a Quick Post draft on mobile. Single Claude call;
 * caller is responsible for surfacing copy-to-clipboard or share-
 * sheet affordances on the returned caption. Direct publish to
 * Meta is a follow-up feature once mobile OAuth deep-link lands.
 */
export async function fetchMobileQuickPostDraft(input: {
  trigger: MobileQuickPostTrigger;
  platform: MobileQuickPostPlatform;
  brief: string;
}): Promise<MobileQuickPostDraftSuccess | MobileApiFailure> {
  const res = await mobilePost<MobileQuickPostDraftJson>(
    MOBILE_API_PATHS.leadsGenDraft,
    {
      trigger: input.trigger,
      platform: input.platform,
      brief: input.brief,
    },
  );
  if (res.ok === false) return res;
  return {
    ok: true,
    caption: res.data.caption ?? "",
    hashtags: res.data.hashtags ?? [],
  };
}



// ── Generate Leads (mobile Meta + LinkedIn connect + publish) ────

export type MobileConnection = {
  id: string;
  platform: "meta" | "linkedin";
  fbPageId: string | null;
  fbPageName: string | null;
  igBusinessUserId: string | null;
  igBusinessUsername: string | null;
  linkedinMemberUrn: string | null;
  linkedinMemberEmail: string | null;
  displayName: string | null;
  pictureUrl: string | null;
  canPublishFacebook: boolean;
  canPublishInstagram: boolean;
  canPublishLinkedIn: boolean;
};

type MobileConnectionsJson = MobileJsonError & {
  connections?: MobileConnection[];
};

/** List the agent's social connections (no tokens). */
export async function fetchMobileConnections(): Promise<
  | { ok: true; connections: MobileConnection[] }
  | MobileApiFailure
> {
  const res = await mobileGet<MobileConnectionsJson>(
    MOBILE_API_PATHS.leadsGenConnections,
  );
  if (res.ok === false) return res;
  return { ok: true, connections: res.data.connections ?? [] };
}

type MobileMetaInitJson = MobileJsonError & {
  url?: string;
};

/**
 * Mint a Meta OAuth URL for the mobile in-app browser. The mobile
 * `returnTo` deep link is encoded into the state token; after the
 * OAuth dance, /api/leads-gen/connect/meta/callback redirects to
 * the deep link with status + count query params.
 */
export async function initMobileMetaConnect(returnTo: string): Promise<
  | { ok: true; url: string }
  | MobileApiFailure
> {
  const res = await mobilePost<MobileMetaInitJson>(
    MOBILE_API_PATHS.leadsGenConnectMetaInit,
    { returnTo },
  );
  if (res.ok === false) return res;
  if (!res.data.url) {
    return { ok: false, status: 500, message: "No URL returned" };
  }
  return { ok: true, url: res.data.url };
}

type MobileDisconnectJson = MobileJsonError & { removed?: number };

export async function disconnectMobileMeta(input: { id?: string; all?: boolean }): Promise<
  | { ok: true; removed: number }
  | MobileApiFailure
> {
  const res = await mobilePost<MobileDisconnectJson>(
    MOBILE_API_PATHS.leadsGenConnectMetaDisconnect,
    input,
  );
  if (res.ok === false) return res;
  return { ok: true, removed: res.data.removed ?? 0 };
}

/**
 * Mint a LinkedIn OAuth URL for the mobile in-app browser. Same
 * `returnTo` deep-link pattern as initMobileMetaConnect — see that
 * function's doc comment for the full rationale.
 */
export async function initMobileLinkedInConnect(returnTo: string): Promise<
  | { ok: true; url: string }
  | MobileApiFailure
> {
  const res = await mobilePost<MobileMetaInitJson>(
    MOBILE_API_PATHS.leadsGenConnectLinkedInInit,
    { returnTo },
  );
  if (res.ok === false) return res;
  if (!res.data.url) {
    return { ok: false, status: 500, message: "No URL returned" };
  }
  return { ok: true, url: res.data.url };
}

export async function disconnectMobileLinkedIn(input: {
  id?: string;
  all?: boolean;
}): Promise<{ ok: true; removed: number } | MobileApiFailure> {
  const res = await mobilePost<MobileDisconnectJson>(
    MOBILE_API_PATHS.leadsGenConnectLinkedInDisconnect,
    input,
  );
  if (res.ok === false) return res;
  return { ok: true, removed: res.data.removed ?? 0 };
}

export type MobilePublishPlatform = "facebook" | "instagram" | "linkedin";

type MobilePublishJson = MobileJsonError & {
  postId?: string;
  externalPostId?: string;
  externalPostUrl?: string | null;
  platform?: MobilePublishPlatform;
};

export type MobilePublishSuccess = {
  ok: true;
  postId: string;
  externalPostId: string;
  externalPostUrl: string | null;
  platform: MobilePublishPlatform;
};

/**
 * Direct publish via the shared `publishPost` helper. Returns the
 * platform-side post id + permalink on success; the QuickPost
 * screen surfaces the link as "View the post →".
 */
export async function publishMobileQuickPost(input: {
  platform: MobilePublishPlatform;
  connectionId: string;
  caption: string;
  hashtags?: string[];
  mediaItemId?: string;
  trigger?: string;
  subjectKind?: string;
  subjectRefId?: string;
}): Promise<MobilePublishSuccess | MobileApiFailure> {
  const res = await mobilePost<MobilePublishJson>(
    MOBILE_API_PATHS.leadsGenPublish,
    input as unknown as Record<string, unknown>,
  );
  if (res.ok === false) return res;
  if (!res.data.postId || !res.data.externalPostId || !res.data.platform) {
    return { ok: false, status: 500, message: "Publish returned no ids" };
  }
  return {
    ok: true,
    postId: res.data.postId,
    externalPostId: res.data.externalPostId,
    externalPostUrl: res.data.externalPostUrl ?? null,
    platform: res.data.platform,
  };
}


// ── Media upload (mobile Quick Post image attach) ────────────────

export type MobileMediaItem = {
  id: string;
  storagePath: string;
  signedUrl: string | null;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  label: string | null;
};

type MobileMediaUploadJson = MobileJsonError & {
  item?: MobileMediaItem;
};

/**
 * Upload an image to the media_library. Multipart POST — bypasses
 * the JSON-based mobilePost helper since FormData needs the
 * platform fetch to set the multipart boundary itself.
 *
 * Returns the created MediaItem (with a 1-hour signed URL). The
 * caller stashes `item.id` and passes it to publishMobileQuickPost
 * as `mediaItemId`.
 */
export async function uploadMobileMedia(input: {
  /** Local file URI from expo-image-picker. */
  uri: string;
  /** Filename hint (used when the source doesn't carry one). */
  fileName?: string;
  /** MIME from the picker. */
  contentType?: string;
  /** Optional agent-supplied caption. */
  label?: string;
}): Promise<{ ok: true; item: MobileMediaItem } | MobileApiFailure> {
  const cfg = requireConfig();
  if (!isMobileConfig(cfg)) return cfg;
  const { base, token } = cfg;

  const fileName =
    input.fileName ||
    input.uri.split("/").pop() ||
    `mobile-upload-${Date.now()}.jpg`;
  const mime = (input.contentType ?? "image/jpeg").toLowerCase();

  // React Native FormData accepts a `{ uri, name, type }` shape for
  // file fields — when fetch sees this it streams the file from
  // disk. No need to base64 the bytes through JS memory.
  const form = new FormData();
  // The unusual cast is because RN's FormData typing doesn't expose
  // the { uri, name, type } file-descriptor shape that the platform
  // actually accepts at runtime.
  form.append(
    "file",
    {
      uri: input.uri,
      name: fileName,
      type: mime,
    } as unknown as Blob,
  );
  if (input.label) form.append("label", input.label.slice(0, 240));

  try {
    const res = await fetch(`${base}${MOBILE_API_PATHS.leadsGenMediaUpload}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        // NB: do NOT set Content-Type — the platform sets it with
        // the multipart boundary when FormData has file entries.
      },
      body: form,
    });
    const body = (await res.json().catch(() => ({}))) as MobileMediaUploadJson;
    if (!res.ok || body.ok === false || body.success === false) {
      return parseMobileFailure(
        res.status,
        body,
        body.error ?? "Upload failed",
      );
    }
    if (!body.item || typeof body.item.id !== "string") {
      return { ok: false, status: 500, message: "Upload returned no item" };
    }
    return { ok: true, item: body.item };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    return { ok: false, status: 0, message: msg };
  }
}


// ── Generate Leads (mobile schedule + recurring) ─────────────────

export type MobileScheduledPost = {
  id: string;
  platform: "facebook" | "instagram" | "linkedin";
  caption: string;
  hashtags: string[];
  mediaLibraryId: string | null;
  scheduledFor: string;
  status: "scheduled" | "posting" | "posted" | "failed" | "cancelled";
  attemptCount: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  publishedLeadPostId: string | null;
  publishedAt: string | null;
  publishedUrl: string | null;
  pageName: string | null;
  igBusinessUsername: string | null;
  linkedinDisplayName: string | null;
  createdAt: string;
};

type MobileScheduleListJson = MobileJsonError & {
  scheduled?: MobileScheduledPost[];
};

type MobileScheduleCreateJson = MobileJsonError & {
  scheduledPostId?: string;
  scheduledFor?: string;
  status?: string;
};

export async function scheduleMobileQuickPost(input: {
  platform: "facebook" | "instagram" | "linkedin";
  connectionId: string;
  caption: string;
  hashtags?: string[];
  mediaItemId?: string;
  scheduledFor: string;
  trigger?: string;
  subjectKind?: string;
  subjectRefId?: string;
}): Promise<
  | { ok: true; scheduledPostId: string; scheduledFor: string; status: string }
  | MobileApiFailure
> {
  const res = await mobilePost<MobileScheduleCreateJson>(
    MOBILE_API_PATHS.leadsGenSchedule,
    input as unknown as Record<string, unknown>,
  );
  if (res.ok === false) return res;
  if (!res.data.scheduledPostId || !res.data.scheduledFor || !res.data.status) {
    return { ok: false, status: 500, message: "Schedule returned no id" };
  }
  return {
    ok: true,
    scheduledPostId: res.data.scheduledPostId,
    scheduledFor: res.data.scheduledFor,
    status: res.data.status,
  };
}

export async function fetchMobileScheduledPosts(): Promise<
  | { ok: true; scheduled: MobileScheduledPost[] }
  | MobileApiFailure
> {
  const res = await mobileGet<MobileScheduleListJson>(
    MOBILE_API_PATHS.leadsGenScheduleList,
  );
  if (res.ok === false) return res;
  return { ok: true, scheduled: res.data.scheduled ?? [] };
}

export async function cancelMobileScheduledPost(
  id: string,
): Promise<{ ok: true; status: string } | MobileApiFailure> {
  const res = await mobilePost<MobileJsonError & { status?: string }>(
    MOBILE_API_PATHS.leadsGenScheduleCancel(id),
    {},
  );
  if (res.ok === false) return res;
  return { ok: true, status: res.data.status ?? "cancelled" };
}

export type MobileRecurrence = {
  id: string;
  platform: "facebook" | "instagram" | "linkedin";
  caption: string;
  cadence: "daily" | "weekly";
  weeklyDayOfWeek: number | null;
  timeOfDayHour: number;
  timeOfDayMinute: number;
  timezone: string;
  startsAt: string;
  endsAt: string | null;
  maxOccurrences: number | null;
  occurrenceCount: number;
  nextOccurrenceAt: string;
  lastMaterializedAt: string | null;
  status: "active" | "paused" | "completed" | "cancelled";
  lastError: string | null;
  socialAccountId: string;
  socialAccountDisplay: string | null;
  createdAt: string;
};

type MobileRecurringCreateJson = MobileJsonError & {
  recurringScheduleId?: string;
  nextOccurrenceAt?: string;
  status?: string;
};
type MobileRecurringListJson = MobileJsonError & {
  recurrences?: MobileRecurrence[];
};

export async function createMobileRecurringPost(input: {
  platform: "facebook" | "instagram" | "linkedin";
  connectionId: string;
  caption: string;
  hashtags?: string[];
  mediaItemId?: string;
  trigger?: string;
  subjectKind?: string;
  subjectRefId?: string;
  cadence: "daily" | "weekly";
  weeklyDayOfWeek?: number;
  timeOfDayHour: number;
  timeOfDayMinute: number;
  timezone: string;
  startsAt?: string;
  endsAt?: string;
  maxOccurrences?: number;
}): Promise<
  | {
      ok: true;
      recurringScheduleId: string;
      nextOccurrenceAt: string;
      status: string;
    }
  | MobileApiFailure
> {
  const res = await mobilePost<MobileRecurringCreateJson>(
    MOBILE_API_PATHS.leadsGenRecurring,
    input as unknown as Record<string, unknown>,
  );
  if (res.ok === false) return res;
  if (
    !res.data.recurringScheduleId ||
    !res.data.nextOccurrenceAt ||
    !res.data.status
  ) {
    return { ok: false, status: 500, message: "Recurring returned no id" };
  }
  return {
    ok: true,
    recurringScheduleId: res.data.recurringScheduleId,
    nextOccurrenceAt: res.data.nextOccurrenceAt,
    status: res.data.status,
  };
}

export async function fetchMobileRecurrences(): Promise<
  | { ok: true; recurrences: MobileRecurrence[] }
  | MobileApiFailure
> {
  const res = await mobileGet<MobileRecurringListJson>(
    MOBILE_API_PATHS.leadsGenRecurringList,
  );
  if (res.ok === false) return res;
  return { ok: true, recurrences: res.data.recurrences ?? [] };
}

export async function updateMobileRecurrence(
  id: string,
  action: "pause" | "resume" | "cancel",
): Promise<{ ok: true; status: string } | MobileApiFailure> {
  const res = await mobilePatch<MobileJsonError & { status?: string }>(
    MOBILE_API_PATHS.leadsGenRecurringAction(id),
    { action },
  );
  if (res.ok === false) return res;
  return { ok: true, status: res.data.status ?? action };
}


// ── Generate Leads (mobile subject picker) ───────────────────────

/**
 * Subject picker option from /api/mobile/leads-gen/subjects.
 *
 * Mirrors `lib/leads-gen/subjects.ts:Subject` on the web. The mobile
 * Quick Post screen renders these as a tappable list under each
 * trigger; picking one auto-fills the brief with a description
 * stitched from label + sub.
 */
export type MobileSubject = {
  id: string;
  label: string;
  sub: string | null;
  kind:
    | "listing"
    | "open_house"
    | "transaction"
    | "market_update"
    | "testimonial"
    | "custom";
  refId: string | null;
};

type MobileSubjectsJson = MobileJsonError & {
  subjects?: MobileSubject[];
};

/**
 * List the picker options for a Quick Post trigger. Only meaningful
 * for the listing-anchored triggers (new_listing, open_house,
 * price_drop, just_sold); the synthetic triggers (market_update,
 * testimonial, custom) return a single canned "subject" with
 * no refId.
 */
export async function fetchMobileSubjects(
  trigger: MobileQuickPostTrigger,
): Promise<{ ok: true; subjects: MobileSubject[] } | MobileApiFailure> {
  const res = await mobileGet<MobileSubjectsJson>(
    MOBILE_API_PATHS.leadsGenSubjects(trigger),
  );
  if (res.ok === false) return res;
  return { ok: true, subjects: res.data.subjects ?? [] };
}


// ── Sphere (likely buyers + likely sellers) ──────────────────────

/**
 * Shared shape between buyers + sellers — both prediction services
 * return the same `contactId / fullName / score / label / topReason`
 * tuple. Mobile only needs the display-side fields.
 */
export type MobileSphereRow = {
  contactId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  lifecycleStage: "past_client" | "sphere";
  closingAddress: string | null;
  closingDate: string | null;
  score: number;
  /** 'high' / 'medium' / 'low' — drives badge color in the UI. */
  label: "high" | "medium" | "low";
  /** One-line "why" from the prediction's top scoring factor. */
  topReason: string;
};

type MobileSphereBuyersJson = MobileJsonError & {
  buyers?: MobileSphereRow[];
};
type MobileSphereSellersJson = MobileJsonError & {
  sellers?: MobileSphereRow[];
};

export async function fetchMobileLikelyBuyers(
  opts?: { limit?: number; minScore?: number; label?: "high" | "medium" | "low" },
): Promise<{ ok: true; buyers: MobileSphereRow[] } | MobileApiFailure> {
  const params = new URLSearchParams();
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.minScore != null) params.set("minScore", String(opts.minScore));
  if (opts?.label) params.set("label", opts.label);
  const q = params.toString();
  const path = q
    ? `${MOBILE_API_PATHS.sphereBuyers}?${q}`
    : MOBILE_API_PATHS.sphereBuyers;
  const res = await mobileGet<MobileSphereBuyersJson>(path);
  if (res.ok === false) return res;
  return { ok: true, buyers: res.data.buyers ?? [] };
}

export async function fetchMobileLikelySellers(
  opts?: { limit?: number; minScore?: number; label?: "high" | "medium" | "low" },
): Promise<{ ok: true; sellers: MobileSphereRow[] } | MobileApiFailure> {
  const params = new URLSearchParams();
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.minScore != null) params.set("minScore", String(opts.minScore));
  if (opts?.label) params.set("label", opts.label);
  const q = params.toString();
  const path = q
    ? `${MOBILE_API_PATHS.sphereSellers}?${q}`
    : MOBILE_API_PATHS.sphereSellers;
  const res = await mobileGet<MobileSphereSellersJson>(path);
  if (res.ok === false) return res;
  return { ok: true, sellers: res.data.sellers ?? [] };
}


// ── Property lookup for the "by_address" Quick Post trigger ──────

export type MobilePropertyLookupResult = {
  address: string;
  found: boolean;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  estimatedValue: number | null;
  listingStatus: string | null;
  brief: string;
};

type MobilePropertyLookupJson = MobileJsonError & {
  result?: MobilePropertyLookupResult;
};

/**
 * Resolve a raw address or listing URL into property metadata +
 * a pre-stitched brief. Used by the mobile Quick Post screen's
 * "By address / URL" trigger pill.
 */
export async function lookupMobileProperty(
  input: string,
): Promise<
  { ok: true; result: MobilePropertyLookupResult } | MobileApiFailure
> {
  const res = await mobilePost<MobilePropertyLookupJson>(
    MOBILE_API_PATHS.leadsGenLookupProperty,
    { input },
  );
  if (res.ok === false) return res;
  if (!res.data.result) {
    return { ok: false, status: 500, message: "Lookup returned no result" };
  }
  return { ok: true, result: res.data.result };
}


// ── Published post history + metrics refresh ─────────────────────

/**
 * Per-platform engagement counts. Whichever fields a platform
 * doesn't expose come back as null so the UI renders "—" rather
 * than misleading zero. Empty object for never-refreshed posts.
 */
export type MobilePostMetrics = {
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  impressions?: number | null;
  reach?: number | null;
  clicks?: number | null;
  reactionsTotal?: number | null;
};

/** Shape returned by /api/mobile/leads-gen/posts/list. */
export type MobilePublishedPost = {
  id: string;
  platform: "facebook" | "instagram" | "linkedin" | string;
  caption: string;
  hashtags: string[];
  mediaLibraryId: string | null;
  thumbnailUrl: string | null;
  externalPostId: string | null;
  externalPostUrl: string | null;
  triggerKind: string | null;
  subjectKind: string | null;
  subjectRefId: string | null;
  status: "published" | "failed" | string;
  errorMessage: string | null;
  metrics: MobilePostMetrics;
  metricsRefreshedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  pageName: string | null;
  igBusinessUsername: string | null;
  linkedinDisplayName: string | null;
};

type MobilePostsListJson = MobileJsonError & {
  posts?: MobilePublishedPost[];
};

/**
 * List the agent's published (and failed) lead_posts, newest first.
 * Includes a thumbnail signed URL for any attached image.
 */
export async function fetchMobilePosts(opts?: {
  limit?: number;
}): Promise<{ ok: true; posts: MobilePublishedPost[] } | MobileApiFailure> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  const q = params.toString();
  const path = q
    ? `${MOBILE_API_PATHS.leadsGenPostsList}?${q}`
    : MOBILE_API_PATHS.leadsGenPostsList;
  const res = await mobileGet<MobilePostsListJson>(path);
  if (res.ok === false) return res;
  return { ok: true, posts: res.data.posts ?? [] };
}

type MobilePostRefreshJson = MobileJsonError & {
  metrics?: MobilePostMetrics | null;
  refreshedAt?: string;
};

/**
 * Refresh a single post's engagement metrics by hitting Meta's
 * Graph API server-side. LinkedIn posts return ok:false with a
 * clear message — the consumer scope doesn't expose post analytics.
 */
export async function refreshMobilePostMetrics(
  postId: string,
): Promise<
  | { ok: true; metrics: MobilePostMetrics | null; refreshedAt: string }
  | MobileApiFailure
> {
  const res = await mobilePost<MobilePostRefreshJson>(
    MOBILE_API_PATHS.leadsGenPostRefresh(postId),
    {},
  );
  if (res.ok === false) return res;
  return {
    ok: true,
    metrics: res.data.metrics ?? null,
    refreshedAt: res.data.refreshedAt ?? new Date().toISOString(),
  };
}


// ── Top-performing posts (Home "Engagement" surface) ─────────────

/** Single row in the top-posts list — what Home's Engagement card renders. */
export type MobileTopPost = {
  id: string;
  platform: "facebook" | "instagram" | "linkedin" | string;
  caption: string;
  thumbnailUrl: string | null;
  externalPostUrl: string | null;
  publishedAt: string | null;
  pageName: string | null;
  igBusinessUsername: string | null;
  linkedinDisplayName: string | null;
  engagementScore: number;
  metrics: {
    likes: number | null;
    comments: number | null;
    shares: number | null;
    saves: number | null;
    reach: number | null;
    impressions: number | null;
  };
};

type MobileTopPostsJson = MobileJsonError & {
  items?: MobileTopPost[];
  windowDays?: number;
  hasMetrics?: boolean;
};

/**
 * Fetch the agent's top-engagement posts for the last N days. Used
 * by the Home screen's Engagement card to surface what's working
 * without making the agent navigate to /post-history.
 *
 * `hasMetrics: false` is the explicit "nothing to show yet" signal —
 * render the empty state instead of an empty list.
 */
export async function fetchMobileTopPosts(opts?: {
  limit?: number;
  windowDays?: number;
}): Promise<
  | {
      ok: true;
      items: MobileTopPost[];
      windowDays: number;
      hasMetrics: boolean;
    }
  | MobileApiFailure
> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.windowDays) params.set("windowDays", String(opts.windowDays));
  const q = params.toString();
  const path = q
    ? `${MOBILE_API_PATHS.leadsGenInsightsTopPosts}?${q}`
    : MOBILE_API_PATHS.leadsGenInsightsTopPosts;
  const res = await mobileGet<MobileTopPostsJson>(path);
  if (res.ok === false) return res;
  return {
    ok: true,
    items: res.data.items ?? [],
    windowDays: res.data.windowDays ?? 14,
    hasMetrics: res.data.hasMetrics ?? false,
  };
}


// ── Suggested next post (Home "What to post next" surface) ───────

/** A single AI-free, CRM-driven post suggestion. */
export type MobileNextPostSuggestion = {
  trigger: "new_listing" | "open_house" | "just_sold";
  subjectId: string;
  label: string;
  sub: string | null;
  reason: string;
  urgency: number;
};

type MobileNextPostSuggestionsJson = MobileJsonError & {
  suggestions?: MobileNextPostSuggestion[];
};

/**
 * Fetch up to N suggestions for what the agent should post next.
 * Deterministic — cross-references the CRM (new listings, open
 * houses, just-solds) against the last 30 days of published posts.
 * Empty array when nothing's worth surfacing.
 */
export async function fetchMobileNextPostSuggestions(opts?: {
  limit?: number;
}): Promise<
  { ok: true; suggestions: MobileNextPostSuggestion[] } | MobileApiFailure
> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  const q = params.toString();
  const path = q
    ? `${MOBILE_API_PATHS.leadsGenSuggestionsNextPost}?${q}`
    : MOBILE_API_PATHS.leadsGenSuggestionsNextPost;
  const res = await mobileGet<MobileNextPostSuggestionsJson>(path);
  if (res.ok === false) return res;
  return { ok: true, suggestions: res.data.suggestions ?? [] };
}
