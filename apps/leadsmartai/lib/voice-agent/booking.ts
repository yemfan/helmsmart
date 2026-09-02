import "server-only";
import {
  normalizeAppointmentMode,
  normalizeAppointmentType,
  resolveAppointmentMode,
} from "@repo/voice";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getReceptionistConfig, getBookingSettings } from "@/lib/voice-receptionist/settings";
import { findContactByPhone, toUsDisplayPhone } from "@/lib/missed-call/service";
import {
  defaultBusinessHours,
  nextOpenDay,
  generateDaySlots,
  validateBookingTime,
  overlapsBusy,
  normalizeDateStr,
  resolveStartMs,
  safeTimezone,
  spokenDateTimeLabel,
  todayInTimezone,
  phoneLast10,
  appointmentListText,
  NO_UPCOMING_APPOINTMENT_TEXT,
  UNSUPPORTED_TOOL_TEXT,
  existingAppointmentsText,
  zonedToUtc,
  type BusinessHours,
  type BusyInterval,
} from "@repo/voice";

/**
 * LeadSmart's AI receptionist booking engine — the DB layer over the shared,
 * pure scheduling core in @repo/voice (availability math + in-hours validation).
 * Backs the Retell custom functions (check_availability / book_appointment /
 * create_callback) via /api/retell/function.
 *
 * LeadSmart has no per-agent hours / appointment-type config yet, so it uses a
 * single 30-minute appointment and the default Mon–Fri 9–5 business hours; the
 * agent's timezone comes from its receptionist config.
 */

const DEFAULT_DURATION_MIN = 30;


async function loadBookingOrg(agentId: string): Promise<{ timezone: string; hours: BusinessHours }> {
  const cfg = await getReceptionistConfig(agentId);
  const { hours } = await getBookingSettings(agentId);
  return { timezone: safeTimezone(cfg.timezone), hours: hours ?? defaultBusinessHours() };
}

/** Existing booked appointments in the window, as busy intervals. */
async function busyIntervals(agentId: string, startUtc: Date, endUtc: Date): Promise<BusyInterval[]> {
  const { data } = await supabaseAdmin
    .from("voice_appointments")
    .select("start_at,end_at")
    .eq("agent_id", agentId as never)
    .eq("status", "booked")
    .gte("start_at", new Date(startUtc.getTime() - 6 * 3600_000).toISOString())
    .lt("start_at", endUtc.toISOString());
  return ((data ?? []) as { start_at: string; end_at: string | null }[]).map((e) => ({
    start: e.start_at,
    end: e.end_at ?? new Date(new Date(e.start_at).getTime() + DEFAULT_DURATION_MIN * 60_000).toISOString(),
  }));
}

export type AvailabilityResult = {
  closed: boolean;
  durationMinutes: number;
  slots: { startISO: string; label: string }[];
};

/** Open slots on the requested date (rolled forward to the next open day). */
export async function getAvailability(agentId: string, dateStr: string): Promise<AvailabilityResult> {
  const { timezone, hours } = await loadBookingOrg(agentId);
  const duration = DEFAULT_DURATION_MIN;
  const todayISO = todayInTimezone(timezone).iso;
  const date0 = normalizeDateStr(dateStr, todayISO);
  const open = nextOpenDay(date0, hours);
  if (!open) return { closed: true, durationMinutes: duration, slots: [] };

  const startUtc = zonedToUtc(open.date, open.open, timezone);
  const endUtc = zonedToUtc(open.date, open.close, timezone);
  const busy = await busyIntervals(agentId, startUtc, endUtc);
  const slots = generateDaySlots({
    date: open.date,
    open: open.open,
    close: open.close,
    timezone,
    busy,
    durationMin: duration,
    now: Date.now(),
  });
  return { closed: false, durationMinutes: duration, slots };
}

export type BookResult = {
  ok: boolean;
  reason?: string;
  startISO?: string;
  label?: string;
  eventId?: string;
  title?: string;
};

/** Book a specific slot — re-validates business hours + conflicts, then inserts. */
export async function bookAppointment(
  agentId: string,
  input: {
    typeName?: string;
    /** What the caller asked for — "video", "over the phone". Free text; the
     *  catalogue maps it, and a mode the purpose cannot honour is dropped. */
    meetingMode?: string;
    startISO?: string;
    dateStr?: string;
    timeStr?: string;
    contactId?: string | null;
    callerName?: string | null;
    callerPhone?: string | null;
  },
): Promise<BookResult> {
  const { timezone, hours } = await loadBookingOrg(agentId);
  const duration = DEFAULT_DURATION_MIN;

  let startMs = resolveStartMs(input.startISO, input.dateStr, input.timeStr, timezone);
  if (startMs === null || startMs < Date.now()) {
    return { ok: false, reason: "That time isn't valid or is in the past." };
  }
  const chk = validateBookingTime({ startMs, durationMin: duration, hours, timezone });
  if (!chk.ok) return { ok: false, reason: chk.reason };
  startMs = chk.startMs;

  const endMs = startMs + duration * 60_000;
  const startISO = new Date(startMs).toISOString();
  const endISO = new Date(endMs).toISOString();
  // Null when the agent said something the catalogue does not recognise —
  // better recorded as absent than as the wrong thing. The title keeps the
  // agent's own words either way.
  const bookedType = normalizeAppointmentType(input.typeName);
  const title = `${(input.typeName || "Appointment").trim()}${input.callerName ? ` — ${input.callerName}` : ""}`;
  const label = spokenDateTimeLabel(startMs, timezone);

  const busy = await busyIntervals(agentId, new Date(startMs - 1), new Date(endMs + 1));
  if (overlapsBusy(startMs, endMs, busy)) {
    // Idempotency: the agent may call book_appointment twice. If THIS caller
    // already holds the slot, treat the repeat as success.
    if (input.contactId) {
      const { data: dupe } = await supabaseAdmin
        .from("voice_appointments")
        .select("id")
        .eq("agent_id", agentId as never)
        .eq("contact_id", input.contactId as never)
        .eq("start_at", startISO)
        .eq("status", "booked")
        .maybeSingle();
      if (dupe) return { ok: true, startISO, label, eventId: String((dupe as { id: unknown }).id), title };
    }
    return { ok: false, reason: "That time was just taken." };
  }

  const { data: evt, error } = await supabaseAdmin
    .from("voice_appointments")
    .insert({
      agent_id: agentId,
      contact_id: input.contactId ?? null,
      caller_name: input.callerName ?? null,
      caller_phone: input.callerPhone ?? null,
      title,
      // The purpose and the medium, kept apart and kept countable. Before
      // this both lived only inside `title`, so nothing could count the
      // month's valuations or filter the calendar to showings.
      appointment_type: bookedType?.id ?? null,
      meeting_mode: bookedType
        ? resolveAppointmentMode(bookedType, normalizeAppointmentMode(input.meetingMode))
        : null,
      start_at: startISO,
      end_at: endISO,
      status: "booked",
      source: "ai_receptionist",
    } as never)
    .select("id")
    .single();

  if (error) {
    // 23505 = the partial unique index caught a concurrent same-slot booking.
    if ((error as { code?: string }).code === "23505") {
      const { data: held } = await supabaseAdmin
        .from("voice_appointments")
        .select("id,contact_id")
        .eq("agent_id", agentId as never)
        .eq("start_at", startISO)
        .eq("status", "booked")
        .maybeSingle();
      const h = held as { id: unknown; contact_id: unknown } | null;
      if (h && String(h.contact_id ?? "") === String(input.contactId ?? "")) {
        return { ok: true, startISO, label, eventId: String(h.id), title };
      }
      return { ok: false, reason: "That time was just taken." };
    }
    console.error("[booking] insert failed:", (error as { message?: string }).message);
    return { ok: false, reason: "I couldn't save that booking — let's try another time." };
  }
  return { ok: true, startISO, label, eventId: String((evt as { id: unknown }).id), title };
}

/** create_callback: ensure the caller is a contact + drop a high-priority task. */
async function createCallbackTask(
  agentId: string,
  fromPhone: string,
  callerName: string,
  note: string,
): Promise<void> {
  let contactId: string | null = null;
  try {
    const c = await findContactByPhone(agentId, fromPhone);
    contactId = c?.id ?? null;
  } catch {
    /* best-effort */
  }
  const who = callerName || toUsDisplayPhone(fromPhone) || fromPhone;
  const dueAt = new Date(Date.now() + 4 * 60 * 60_000).toISOString();
  try {
    await supabaseAdmin.from("crm_tasks").insert({
      agent_id: agentId,
      contact_id: contactId,
      title: `Call back ${who}`,
      description: note ? `Caller requested a call back. ${note}` : "Caller requested a call back (AI receptionist).",
      status: "open",
      priority: "high",
      task_type: "voice_follow_up",
      source: "ai_call",
      due_at: dueAt,
      metadata_json: { reason: "callback_request", captured_by: "ai_receptionist" },
    } as never);
  } catch (e) {
    console.error("[booking] callback task failed:", e);
  }
}

export type ToolResult = {
  text: string;
  /** Set only by a successful book_appointment. The caller of this module is
   *  expected to act on these — they are what /api/retell/function turns into
   *  the Realtor's "you have a new appointment" alert. */
  bookedEventId?: string;
  bookedLabel?: string;
  bookedNote?: string;
  bookedContactId?: string | null;
  bookedCallerName?: string | null;
  /** UTC start, so the confirmation can be re-rendered in the caller's own
   *  language rather than reusing the English `bookedLabel`. */
  bookedStartISO?: string;
};

/** Dispatch a Retell custom-function call to the right booking action. Returns a
 *  short instruction string for the agent (Retell shows `result` to the LLM). */
/**
 * Upcoming booked appointments for THIS caller, soonest first.
 *
 * Matching is done in JS rather than in the query on purpose: an appointment
 * booked before the contact existed has `contact_id` null and only a phone, and
 * the stored phone format varies ("(626) 625-5055" vs "+16266255055"). Comparing
 * the last ten digits catches both. The agent's upcoming list is small, so
 * over-fetching and filtering here is cheaper than getting the filter wrong.
 */
async function upcomingForCaller(
  agentId: string,
  fromPhone: string,
  contactId: string | null,
): Promise<{ title: string | null; start_at: string }[]> {
  const { data } = await supabaseAdmin
    .from("voice_appointments")
    .select("title,start_at,contact_id,caller_phone")
    .eq("agent_id", agentId as never)
    .eq("status", "booked")
    .gte("start_at", new Date().toISOString())
    .order("start_at", { ascending: true })
    .limit(50);

  const mine = phoneLast10(fromPhone);
  return ((data ?? []) as {
    title: string | null;
    start_at: string;
    contact_id: string | null;
    caller_phone: string | null;
  }[]).filter(
    (r) => (contactId && r.contact_id === contactId) || (!!mine && phoneLast10(r.caller_phone) === mine),
  );
}

export async function runReceptionistTool(
  name: string,
  args: Record<string, unknown>,
  ctx: { agentId: string; fromPhone: string },
): Promise<ToolResult> {
  const a = args || {};

  if (name === "check_availability") {
    const dateStr = String(a.date ?? a.day ?? a.start ?? "");
    const r = await getAvailability(ctx.agentId, dateStr);
    if (r.closed) return { text: "We're closed that day. Offer another day within business hours." };
    if (!r.slots.length) return { text: "No open times that day — offer the next open day." };
    // Spell the duration ("thirty") so TTS doesn't read "30" as "three zero".
    return {
      text: `Open thirty-minute appointment times: ${r.slots.map((s) => s.label).join("; ")}. Offer these and confirm one. Say times as words (e.g. "eleven thirty"), not digit by digit.`,
    };
  }

  if (name === "lookup_appointment") {
    const { timezone } = await loadBookingOrg(ctx.agentId);
    let contactId: string | null = null;
    try {
      const c = await findContactByPhone(ctx.agentId, ctx.fromPhone);
      contactId = c?.id ?? null;
    } catch {
      /* best-effort — fall back to phone matching */
    }
    const rows = await upcomingForCaller(ctx.agentId, ctx.fromPhone, contactId);
    if (!rows.length) return { text: NO_UPCOMING_APPOINTMENT_TEXT };
    // "the Realtor" — CloseBoss's tenants are licensed agents; HelmSmart passes
    // "the team". The only word that differs between the two apps' answers.
    return { text: existingAppointmentsText(rows, timezone, "the Realtor") };
  }

  if (name === "book_appointment") {
    const callerName = String(a.name ?? a.caller_name ?? "").trim();
    let contactId: string | null = null;
    try {
      const c = await findContactByPhone(ctx.agentId, ctx.fromPhone);
      contactId = c?.id ?? null;
    } catch {
      /* best-effort */
    }
    const r = await bookAppointment(ctx.agentId, {
      typeName: String(a.appointment_type ?? a.type ?? "Appointment"),
      // Retell names its arguments in snake_case; this is the medium the
      // caller asked for. Undefined when the agent did not send it, in which
      // case the purpose falls back to its own default mode.
      meetingMode: a.meeting_mode ? String(a.meeting_mode) : undefined,
      startISO: a.start ? String(a.start) : undefined,
      dateStr: a.date ? String(a.date) : undefined,
      timeStr: a.time ? String(a.time) : undefined,
      contactId,
      callerName: callerName || null,
      callerPhone: toUsDisplayPhone(ctx.fromPhone) || ctx.fromPhone,
    });
    if (!r.ok) return { text: r.reason || "I couldn't book that — offer another time." };
    return {
      text: `Booked: ${r.label}. Confirm it back to the caller.`,
      bookedEventId: r.eventId,
      bookedLabel: r.label,
      bookedNote: r.title,
      bookedContactId: contactId,
      bookedCallerName: callerName || null,
      bookedStartISO: r.startISO,
    };
  }

  if (name === "create_callback") {
    const callerName = String(a.name ?? a.caller_name ?? "").trim();
    const note = String(a.reason ?? a.message ?? a.note ?? "").trim();
    await createCallbackTask(ctx.agentId, ctx.fromPhone, callerName, note);
    return { text: "Noted a callback request. Tell the caller someone will call them back." };
  }

  return { text: UNSUPPORTED_TOOL_TEXT };
}
