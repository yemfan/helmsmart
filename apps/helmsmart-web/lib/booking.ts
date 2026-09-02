import { createServiceClient } from "@/lib/supabase/server";
import { getGoogleFreeBusy, upsertGoogleEvent, deleteGoogleEvent, type BusyInterval } from "@/lib/google-calendar";
import { defaultBusinessHours, type BusinessHours } from "@/lib/receptionist";
import { zonedToUtc, normalizeDateStr, resolveStartMs, safeTimezone, spokenDateTimeLabel, todayInTimezone } from "@repo/voice/datetime";
import {
  overlapsBusy,
  nextOpenDay,
  generateDaySlots,
  validateBookingTime,
} from "@repo/voice/scheduling";
import { DEFAULT_APPOINTMENT_MINUTES, splitCallerName, appointmentTitle } from "@helm/dna-service";

// The receptionist's booking engine: availability (business hours ∩ free/busy)
// and conflict-safe booking. Service-client based — runs in the voice webhook.
// The pure date/time parsing it relies on lives in @repo/voice/datetime.

// Re-exported so existing `@/lib/booking` importers of these keep working.
export { normalizeDateStr, resolveStartMs };

const SLOT_STEP_MS = 30 * 60_000;

async function loadOrg(orgId: string): Promise<{ timezone: string; hours: BusinessHours }> {
  const db = await createServiceClient();
  const { data } = await db.from("organizations").select("timezone, business_hours").eq("id", orgId).single();
  return {
    timezone: safeTimezone(data?.timezone as string | null),
    // Never null. `nextOpenDay(date, null)` returns null, which check_availability
    // reports as "closed" — for every date, forever — while validateBookingTime
    // treats null hours as "always ok" and books anyway. An org that had not filled
    // in its hours got exactly that split: told it was closed, booked regardless.
    // Defaulting to Mon–Fri 9–5 makes both halves agree.
    hours: (data?.business_hours as BusinessHours | null) ?? defaultBusinessHours(),
  };
}

async function findType(orgId: string, name: string): Promise<{ id: string; name: string; duration_minutes: number } | null> {
  const db = await createServiceClient();
  const { data } = await db
    .from("appointment_types")
    .select("id, name, duration_minutes")
    .eq("organization_id", orgId)
    .eq("active", true)
    .ilike("name", `%${name}%`)
    .limit(1)
    .maybeSingle();
  return (data as { id: string; name: string; duration_minutes: number } | null) ?? null;
}

/** Busy intervals from Google Calendar (if connected) else internal events. */
async function busyIntervals(orgId: string, startUtc: Date, endUtc: Date): Promise<BusyInterval[]> {
  const gcal = await getGoogleFreeBusy(orgId, startUtc.toISOString(), endUtc.toISOString());
  if (gcal !== null) return gcal;

  const db = await createServiceClient();
  const { data } = await db
    .from("events")
    .select("start_at, end_at")
    .eq("organization_id", orgId)
    .gte("start_at", new Date(startUtc.getTime() - 6 * 3600_000).toISOString())
    .lt("start_at", endUtc.toISOString());
  return (data ?? []).map((e) => {
    const start = e.start_at as string;
    const end = (e.end_at as string | null) ?? new Date(new Date(start).getTime() + SLOT_STEP_MS).toISOString();
    return { start, end };
  });
}

export type AvailabilityResult = {
  closed: boolean;
  durationMinutes: number;
  slots: { startISO: string; label: string }[];
};

/** Open slots for an appointment type on a given date (YYYY-MM-DD). */
export async function getAvailability(orgId: string, appointmentTypeName: string, dateStr: string): Promise<AvailabilityResult> {
  const { timezone, hours } = await loadOrg(orgId);
  const type = await findType(orgId, appointmentTypeName);
  const duration = type?.duration_minutes ?? DEFAULT_APPOINTMENT_MINUTES;

  // Normalize whatever the agent sent (weekday name, natural date, …) to a real
  // calendar date, then roll forward past closed days (weekends/holidays) to the
  // next open day so the caller is always offered real times.
  const todayISO = todayInTimezone(timezone).iso;
  // Normalize the requested date, then roll forward to the next open day so the
  // caller is always offered real times (shared @repo/voice/scheduling core).
  const date0 = normalizeDateStr(dateStr, todayISO);
  const open = nextOpenDay(date0, hours);
  if (!open) return { closed: true, durationMinutes: duration, slots: [] };

  const openUtc = zonedToUtc(open.date, open.open, timezone);
  const closeUtc = zonedToUtc(open.date, open.close, timezone);
  const busy = await busyIntervals(orgId, openUtc, closeUtc);
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

export type BookResult = { ok: boolean; reason?: string; startISO?: string; label?: string; eventId?: string; title?: string; rescheduleToken?: string };

/** Book a specific slot — re-validates, writes to Google Calendar (if connected) + the internal calendar. */
export async function bookAppointment(
  orgId: string,
  input: {
    appointmentTypeName: string;
    startISO?: string;
    dateStr?: string;
    timeStr?: string;
    clientId?: string | null;
    callerName?: string | null;
  }
): Promise<BookResult> {
  const { timezone, hours } = await loadOrg(orgId);
  const type = await findType(orgId, input.appointmentTypeName);
  const duration = type?.duration_minutes ?? DEFAULT_APPOINTMENT_MINUTES;

  let startMs = resolveStartMs(input.startISO, input.dateStr, input.timeStr, timezone);
  if (startMs === null || startMs < Date.now()) {
    return { ok: false, reason: "That time isn't valid or is in the past." };
  }

  // Keep appointments inside business hours. A closed-day request rolls forward to
  // the next open day (same as check_availability) so the booking lands on a real
  // open day; the time of day must then sit inside that day's open–close window.
  // (After-hours emergencies are handled live by the agent, not booked.)
  // Keep the booking inside business hours (shared core): a closed-day request
  // rolls forward to the next open day, then the time must sit inside open–close.
  const inHours = validateBookingTime({ startMs, durationMin: duration, hours, timezone });
  if (!inHours.ok) return { ok: false, reason: inHours.reason };
  startMs = inHours.startMs;
  const endMs = startMs + duration * 60_000;
  const title = appointmentTitle(type?.name, input.callerName);
  const startISO = new Date(startMs).toISOString();
  const endISO = new Date(endMs).toISOString();
  const db = await createServiceClient();

  // Idempotency: the agent (or Retell) sometimes calls book_appointment more than
  // once in a call. If THIS caller already holds this exact slot, treat the repeat
  // as success rather than "that time was just taken".
  if (input.clientId) {
    const { data: dupe } = await db
      .from("events")
      .select("id, reschedule_token")
      .eq("organization_id", orgId)
      .eq("client_id", input.clientId)
      .eq("start_at", startISO)
      .maybeSingle();
    if (dupe) return { ok: true, startISO, label: spokenDateTimeLabel(startMs, timezone), eventId: dupe.id as string, title, rescheduleToken: dupe.reschedule_token as string | undefined };
  }

  const busy = await busyIntervals(orgId, new Date(startMs - 1), new Date(endMs + 1));
  if (overlapsBusy(startMs, endMs, busy)) return { ok: false, reason: "That time was just taken." };

  // smbai's internal calendar first. The unique index on (organization_id,
  // start_at) for appointments makes a same-slot double-booking impossible even
  // under a race — the Retell agent fires book_appointment several times per call.
  // Insert before the Google sync so a race-loser doesn't orphan a Google event.
  const { data: evt, error: insErr } = await db
    .from("events")
    .insert({
      organization_id: orgId,
      client_id: input.clientId ?? null,
      title,
      type: "appointment",
      color: "indigo",
      start_at: startISO,
      end_at: endISO,
      all_day: false,
      completed: false,
    })
    .select("id, reschedule_token")
    .single();

  if (insErr) {
    // 23505 = unique violation: a concurrent booking already took this exact slot.
    if (insErr.code === "23505") {
      const { data: held } = await db
        .from("events")
        .select("id, client_id, reschedule_token")
        .eq("organization_id", orgId)
        .eq("type", "appointment")
        .eq("start_at", startISO)
        .maybeSingle();
      // Same caller racing themselves → return the booking they wanted (idempotent).
      if (held && held.client_id === (input.clientId ?? null)) {
        return { ok: true, startISO, label: spokenDateTimeLabel(startMs, timezone), eventId: held.id as string, title, rescheduleToken: held.reschedule_token as string | undefined };
      }
      return { ok: false, reason: "That time was just taken." };
    }
    return { ok: false, reason: "I couldn't save that booking — let's try another time." };
  }

  // Owner's real calendar (no-op if not connected) — only after the slot is ours.
  // Persist the Google event id so a later cancel/reschedule can move/remove it.
  const { googleEventId } = await upsertGoogleEvent({ orgId, title, startAt: startISO, endAt: endISO, timezone });
  if (googleEventId && evt?.id) {
    await db.from("events").update({ google_event_id: googleEventId }).eq("id", evt.id);
  }

  return { ok: true, startISO, label: spokenDateTimeLabel(startMs, timezone), eventId: evt?.id, title, rescheduleToken: evt?.reschedule_token as string | undefined };
}

/** Match a caller to a client by phone, creating a lightweight one if new. */
export async function matchOrCreateClient(orgId: string, phone: string, name?: string | null): Promise<string | null> {
  const db = await createServiceClient();
  const { data: existing } = await db
    .from("clients")
    .select("id")
    .eq("organization_id", orgId)
    .eq("phone", phone)
    .maybeSingle();
  if (existing) return existing.id;

  const { firstName, lastName } = splitCallerName(name);
  const { data: created } = await db
    .from("clients")
    .insert({
      organization_id: orgId,
      first_name: firstName,
      last_name: lastName,
      phone,
      status: "lead",
      source: "voice",
    })
    .select("id")
    .single();
  return created?.id ?? null;
}

// ─── Cancel / reschedule (service-role; callable from webhooks + public links) ──

type ApptRow = {
  id: string;
  start_at: string;
  end_at: string | null;
  title: string | null;
  client_id: string | null;
  google_event_id: string | null;
  reschedule_token: string | null;
};

/** Resolve one appointment by event id, reschedule token, or — failing those —
 *  the given client's NEXT upcoming appointment. */
async function findAppointment(
  db: Awaited<ReturnType<typeof createServiceClient>>,
  orgId: string,
  by: { eventId?: string | null; token?: string | null; clientId?: string | null },
): Promise<ApptRow | null> {
  const cols = "id, start_at, end_at, title, client_id, google_event_id, reschedule_token";
  if (by.eventId) {
    const { data } = await db.from("events").select(cols).eq("organization_id", orgId).eq("type", "appointment").eq("id", by.eventId).maybeSingle();
    return (data as ApptRow | null) ?? null;
  }
  if (by.token) {
    const { data } = await db.from("events").select(cols).eq("organization_id", orgId).eq("type", "appointment").eq("reschedule_token", by.token).maybeSingle();
    return (data as ApptRow | null) ?? null;
  }
  if (by.clientId) {
    const { data } = await db
      .from("events").select(cols)
      .eq("organization_id", orgId).eq("type", "appointment").eq("client_id", by.clientId)
      .gte("start_at", new Date().toISOString())
      .order("start_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return (data as ApptRow | null) ?? null;
  }
  return null;
}

export type CancelResult = { ok: boolean; reason?: string; label?: string; startISO?: string; title?: string };

/**
 * Cancel an appointment (hard-delete + remove the Google copy). Find it by event
 * id or by the caller's next upcoming appointment. The reminder queue row is
 * removed automatically via outbound_call_queue's ON DELETE CASCADE.
 */
export async function cancelAppointment(
  orgId: string,
  by: { eventId?: string | null; clientId?: string | null },
): Promise<CancelResult> {
  const db = await createServiceClient();
  const appt = await findAppointment(db, orgId, by);
  if (!appt) return { ok: false, reason: "No upcoming appointment found." };

  const { timezone } = await loadOrg(orgId);
  const label = spokenDateTimeLabel(new Date(appt.start_at).getTime(), timezone);

  const { error } = await db.from("events").delete().eq("organization_id", orgId).eq("id", appt.id);
  if (error) return { ok: false, reason: "Couldn't cancel that — please try again." };

  if (appt.google_event_id) await deleteGoogleEvent(orgId, appt.google_event_id);

  return { ok: true, label, startISO: appt.start_at, title: appt.title ?? undefined };
}

/**
 * Reschedule an appointment to a new time. Re-validates business hours + slot
 * availability (excluding the appointment's own current slot so a small shift
 * doesn't collide with itself), updates the row, and moves the Google event.
 * Find it by reschedule token or event id.
 */
export async function rescheduleAppointment(
  orgId: string,
  input: { eventId?: string | null; token?: string | null; startISO?: string; dateStr?: string; timeStr?: string },
): Promise<BookResult> {
  const db = await createServiceClient();
  const appt = await findAppointment(db, orgId, { eventId: input.eventId, token: input.token });
  if (!appt) return { ok: false, reason: "We couldn't find that appointment." };

  const { timezone, hours } = await loadOrg(orgId);
  const oldStartMs = new Date(appt.start_at).getTime();
  const oldEndMs = appt.end_at ? new Date(appt.end_at).getTime() : oldStartMs + DEFAULT_APPOINTMENT_MINUTES * 60_000;
  const durationMin = Math.max(1, Math.round((oldEndMs - oldStartMs) / 60_000));

  let startMs = resolveStartMs(input.startISO, input.dateStr, input.timeStr, timezone);
  if (startMs === null || startMs < Date.now()) return { ok: false, reason: "That time isn't valid or is in the past." };

  const inHours = validateBookingTime({ startMs, durationMin, hours, timezone });
  if (!inHours.ok) return { ok: false, reason: inHours.reason };
  startMs = inHours.startMs;
  const endMs = startMs + durationMin * 60_000;
  const startISO = new Date(startMs).toISOString();
  const endISO = new Date(endMs).toISOString();

  // Conflict check excluding this appointment's own slot (appointments hold a
  // unique start_at, so dropping that start removes only this event's interval).
  const busy = (await busyIntervals(orgId, new Date(startMs - 1), new Date(endMs + 1))).filter((b) => b.start !== appt.start_at);
  if (overlapsBusy(startMs, endMs, busy)) return { ok: false, reason: "That time is taken." };

  const { error } = await db.from("events").update({ start_at: startISO, end_at: endISO }).eq("organization_id", orgId).eq("id", appt.id);
  if (error) {
    if ((error as { code?: string }).code === "23505") return { ok: false, reason: "That time was just taken." };
    return { ok: false, reason: "Couldn't reschedule — please try another time." };
  }

  // Move the Google copy (or create one if it was missing but Google is now connected).
  const { googleEventId } = await upsertGoogleEvent({
    orgId,
    existingGoogleEventId: appt.google_event_id,
    title: appt.title ?? "Appointment",
    startAt: startISO,
    endAt: endISO,
    timezone,
  });
  if (googleEventId && googleEventId !== appt.google_event_id) {
    await db.from("events").update({ google_event_id: googleEventId }).eq("id", appt.id);
  }

  return { ok: true, startISO, label: spokenDateTimeLabel(startMs, timezone), eventId: appt.id, title: appt.title ?? undefined };
}

export type UpcomingAppointment = { eventId: string; startISO: string; label: string; rescheduleToken: string | null };

/** The client's next upcoming appointment, with a spoken label + reschedule token —
 *  for building a cancel-confirmation / reschedule prompt over SMS. */
export async function getUpcomingAppointment(orgId: string, clientId: string): Promise<UpcomingAppointment | null> {
  const db = await createServiceClient();
  const appt = await findAppointment(db, orgId, { clientId });
  if (!appt) return null;
  const { timezone } = await loadOrg(orgId);
  return {
    eventId: appt.id,
    startISO: appt.start_at,
    label: spokenDateTimeLabel(new Date(appt.start_at).getTime(), timezone),
    rescheduleToken: appt.reschedule_token,
  };
}

/** Open slots for a given duration (minutes) on a date — used by the public
 *  reschedule page, which knows the appointment's duration but not its type. */
export async function getRescheduleAvailability(orgId: string, durationMinutes: number, dateStr: string): Promise<AvailabilityResult> {
  const { timezone, hours } = await loadOrg(orgId);
  const date0 = normalizeDateStr(dateStr, todayInTimezone(timezone).iso);
  const open = nextOpenDay(date0, hours);
  if (!open) return { closed: true, durationMinutes, slots: [] };
  const openUtc = zonedToUtc(open.date, open.open, timezone);
  const closeUtc = zonedToUtc(open.date, open.close, timezone);
  const busy = await busyIntervals(orgId, openUtc, closeUtc);
  const slots = generateDaySlots({ date: open.date, open: open.open, close: open.close, timezone, busy, durationMin: durationMinutes, now: Date.now() });
  return { closed: false, durationMinutes, slots };
}
