import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  MobileBookingLinkDto,
  MobileCalendarEventDto,
  MobileCalendarEventStatus,
  MobileCalendarProvider,
} from "@leadsmart/shared";

async function assertLeadOwned(agentId: string, leadId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("id", leadId as never)
    .eq("agent_id", agentId as never)
    .is("merged_into_lead_id", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("NOT_FOUND");
}

async function touchLeadActivity(leadId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("contacts")
    .update({ last_activity_at: now } as never)
    .eq("id", leadId as never);
  if (error) throw new Error(error.message);
}

function normalizeStatus(s: string | undefined | null): MobileCalendarEventStatus {
  const v = String(s || "scheduled").toLowerCase();
  if (v === "cancelled" || v === "canceled") return "cancelled";
  if (v === "completed") return "completed";
  return "scheduled";
}

function normalizeProvider(p: string | undefined | null): MobileCalendarProvider | null {
  if (p == null || p === "") return null;
  const v = String(p).toLowerCase();
  if (v === "google" || v === "outlook" || v === "local") return v;
  return "local";
}

function mapEventRow(row: Record<string, unknown>, leadName: string | null): MobileCalendarEventDto {
  return {
    id: String(row.id ?? ""),
    contact_id: String(row.contact_id ?? ""),
    lead_name: leadName,
    title: String(row.title ?? ""),
    description: row.description != null ? String(row.description) : null,
    starts_at: String(row.starts_at ?? ""),
    ends_at: row.ends_at != null ? String(row.ends_at) : null,
    timezone: row.timezone != null ? String(row.timezone) : null,
    status: normalizeStatus(row.status as string),
    calendar_provider: normalizeProvider(row.calendar_provider as string),
    external_event_id: row.external_event_id != null ? String(row.external_event_id) : null,
    external_calendar_id: row.external_calendar_id != null ? String(row.external_calendar_id) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function mapBookingRow(row: Record<string, unknown>, leadName: string | null): MobileBookingLinkDto {
  return {
    id: String(row.id ?? ""),
    contact_id: String(row.contact_id ?? ""),
    lead_name: leadName,
    booking_url: String(row.booking_url ?? ""),
    label: row.label != null ? String(row.label) : null,
    share_message: row.share_message != null ? String(row.share_message) : null,
    expires_at: row.expires_at != null ? String(row.expires_at) : null,
    created_at: String(row.created_at ?? ""),
  };
}

/**
 * The contact ids worth looking up names for.
 *
 * `contact_id` is nullable, and this used to be `rows.map((r) => String(r.contact_id))`.
 * `String(null)` is the literal "null", which Postgres rejects as a uuid — so a
 * single contactless appointment failed the whole `.in()` query and took every
 * other event on the agent's calendar down with it. Nulls are dropped here
 * rather than stringified.
 */
export function contactIdsForLookup(rows: readonly unknown[]): string[] {
  return [
    ...new Set(
      rows
        .map((r) => (r as { contact_id?: unknown }).contact_id)
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0),
    ),
  ];
}

export async function listMobileCalendarEvents(params: {
  agentId: string;
  fromIso?: string;
  toIso?: string;
  /** When set, only events for this lead (dashboard lead drawer, etc.). */
  leadId?: string;
}): Promise<MobileCalendarEventDto[]> {
  const { agentId } = params;
  const from = params.fromIso ?? new Date().toISOString();
  const to =
    params.toIso ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  let evQ = supabaseAdmin
    .from("lead_calendar_events")
    .select(
      "id,contact_id,title,description,starts_at,ends_at,timezone,status,calendar_provider,external_event_id,external_calendar_id,created_at,updated_at"
    )
    .eq("agent_id", agentId as never)
    .eq("status", "scheduled")
    .gte("starts_at", from)
    .lte("starts_at", to);

  if (params.leadId) {
    evQ = evQ.eq("contact_id", params.leadId as never);
  }

  const { data: evs, error } = await evQ.order("starts_at", { ascending: true }).limit(500);

  if (error) throw new Error(error.message);

  const rows = evs ?? [];
  const leadIds = contactIdsForLookup(rows);
  const nameById = new Map<string, string | null>();
  if (leadIds.length) {
    const { data: leads, error: le } = await supabaseAdmin
      .from("contacts")
      .select("id,name")
      .eq("agent_id", agentId as never)
      .in("id", leadIds as never);
    if (le) throw new Error(le.message);
    for (const l of leads ?? []) {
      const r = l as { id: unknown; name: unknown };
      nameById.set(String(r.id), r.name != null ? String(r.name) : null);
    }
  }

  const manual = rows.map((r) => {
    const cid = (r as { contact_id: unknown }).contact_id;
    const name = typeof cid === "string" && cid ? nameById.get(cid) ?? null : null;
    return mapEventRow(r as Record<string, unknown>, name);
  });

  // Everything Emma books lives in `voice_appointments`, not here. The
  // calendar has been reading only `lead_calendar_events` — the table the
  // retired Twilio-era flow wrote to — so an agent could take five bookings
  // on the phone and see an empty month.
  const booked = await listVoiceAppointmentsAsEvents({
    agentId,
    from,
    to,
    leadId: params.leadId,
  });

  return [...manual, ...booked].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/**
 * Appointments the AI receptionist booked, shaped like calendar events.
 *
 * Read-only here: `voice_appointments` stays the source of truth for what was
 * agreed on a call — including its purpose and meeting mode — and this only
 * surfaces it alongside manually created events. Copying rows between the two
 * tables would mean two records of one appointment that can disagree, which
 * is the shape of bug this is fixing.
 */
async function listVoiceAppointmentsAsEvents(params: {
  agentId: string;
  from: string;
  to: string;
  leadId?: string;
}): Promise<MobileCalendarEventDto[]> {
  let q = supabaseAdmin
    .from("voice_appointments")
    .select(
      "id,contact_id,caller_name,title,start_at,end_at,status,appointment_type,meeting_mode,created_at",
    )
    .eq("agent_id", params.agentId as never)
    .neq("status", "cancelled")
    .gte("start_at", params.from)
    .lte("start_at", params.to);

  if (params.leadId) q = q.eq("contact_id", params.leadId as never);

  const { data, error } = await q.order("start_at", { ascending: true }).limit(500);
  if (error) {
    // Never fail the whole calendar over this half — a manual event the agent
    // typed in should still render if the booking read goes wrong.
    console.error("[calendar] could not read voice_appointments:", error.message);
    return [];
  }

  return (data ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    const mode = r.meeting_mode != null ? String(r.meeting_mode) : null;
    return {
      id: `voice:${String(r.id ?? "")}`,
      contact_id: String(r.contact_id ?? ""),
      lead_name: r.caller_name != null ? String(r.caller_name) : null,
      title: String(r.title ?? "Appointment"),
      // The mode is the one thing the title never carries, and it is what
      // tells the agent whether to drive somewhere.
      description: mode ? mode.replace("_", " ") : null,
      starts_at: String(r.start_at ?? ""),
      ends_at: r.end_at != null ? String(r.end_at) : null,
      timezone: null,
      status: "scheduled" as const,
      calendar_provider: null,
      external_event_id: null,
      external_calendar_id: null,
      created_at: String(r.created_at ?? ""),
      updated_at: String(r.created_at ?? ""),
    };
  });
}

export async function fetchNextAppointmentForLead(
  agentId: string,
  leadId: string
): Promise<MobileCalendarEventDto | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("lead_calendar_events")
    .select(
      "id,contact_id,title,description,starts_at,ends_at,timezone,status,calendar_provider,external_event_id,external_calendar_id,created_at,updated_at"
    )
    .eq("agent_id", agentId as never)
    .eq("contact_id", leadId as never)
    .eq("status", "scheduled")
    .gte("starts_at", now)
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const { data: lead } = await supabaseAdmin
    .from("contacts")
    .select("name")
    .eq("id", leadId as never)
    .eq("agent_id", agentId as never)
    .maybeSingle();

  const nm = (lead as { name?: unknown } | null)?.name;
  return mapEventRow(data as Record<string, unknown>, nm != null ? String(nm) : null);
}

export async function listRecentBookingLinksForLead(params: {
  agentId: string;
  leadId: string;
  limit?: number;
}): Promise<MobileBookingLinkDto[]> {
  const lim = Math.min(Math.max(params.limit ?? 5, 1), 20);
  const { data: rows, error } = await supabaseAdmin
    .from("lead_booking_links")
    .select("id,contact_id,booking_url,label,share_message,expires_at,created_at")
    .eq("agent_id", params.agentId as never)
    .eq("contact_id", params.leadId as never)
    .order("created_at", { ascending: false })
    .limit(lim);

  if (error) throw new Error(error.message);

  const { data: lead } = await supabaseAdmin
    .from("contacts")
    .select("name")
    .eq("id", params.leadId as never)
    .eq("agent_id", params.agentId as never)
    .maybeSingle();

  const nm = (lead as { name?: unknown } | null)?.name;
  const leadName = nm != null ? String(nm) : null;

  return (rows ?? []).map((r) => mapBookingRow(r as Record<string, unknown>, leadName));
}

/**
 * Create a calendar event. `leadId` is OPTIONAL: `lead_calendar_events.contact_id`
 * is nullable, and plenty of an agent's day — a personal block, an open house,
 * a caravan — has no single contact attached. The dashboard has always offered
 * "No contact" as the default, so requiring one here rejected exactly what the
 * UI invited.
 */
export async function createMobileCalendarEvent(params: {
  agentId: string;
  /** contacts.id to attach, or null/undefined for an appointment with no contact. */
  leadId?: string | null;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt?: string | null;
  timezone?: string | null;
  calendarProvider?: MobileCalendarProvider | null;
  externalEventId?: string | null;
  externalCalendarId?: string | null;
}): Promise<MobileCalendarEventDto> {
  const leadId = params.leadId?.trim() || null;
  // Ownership only means something when a contact is actually attached.
  if (leadId) await assertLeadOwned(params.agentId, leadId);
  const now = new Date().toISOString();
  const insert = {
    contact_id: leadId,
    agent_id: params.agentId,
    title: params.title.trim(),
    description: params.description ?? null,
    starts_at: params.startsAt,
    ends_at: params.endsAt ?? null,
    timezone: params.timezone ?? null,
    status: "scheduled",
    calendar_provider: params.calendarProvider ?? "local",
    external_event_id: params.externalEventId ?? null,
    external_calendar_id: params.externalCalendarId ?? null,
    metadata_json: {},
    updated_at: now,
  };

  const { data, error } = await supabaseAdmin
    .from("lead_calendar_events")
    .insert(insert as never)
    .select(
      "id,contact_id,title,description,starts_at,ends_at,timezone,status,calendar_provider,external_event_id,external_calendar_id,created_at,updated_at"
    )
    .single();

  if (error) throw new Error(error.message);

  // No contact — nothing to name and nothing whose activity to touch.
  if (!leadId) return mapEventRow(data as Record<string, unknown>, null);

  const { data: lead } = await supabaseAdmin
    .from("contacts")
    .select("name")
    .eq("id", leadId as never)
    .maybeSingle();

  const nm = (lead as { name?: unknown } | null)?.name;
  await touchLeadActivity(leadId);
  return mapEventRow(data as Record<string, unknown>, nm != null ? String(nm) : null);
}

export async function patchMobileCalendarEvent(params: {
  agentId: string;
  eventId: string;
  status?: MobileCalendarEventStatus;
  title?: string;
  description?: string | null;
  startsAt?: string;
  endsAt?: string | null;
}): Promise<MobileCalendarEventDto> {
  const { data: existing, error: e0 } = await supabaseAdmin
    .from("lead_calendar_events")
    .select("id,contact_id")
    .eq("id", params.eventId as never)
    .eq("agent_id", params.agentId as never)
    .maybeSingle();

  if (e0) throw new Error(e0.message);
  if (!existing) throw new Error("NOT_FOUND");

  const rawContactId = (existing as { contact_id: unknown }).contact_id;
  const leadId =
    typeof rawContactId === "string" && rawContactId ? rawContactId : null;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (params.status != null) patch.status = params.status;
  if (params.title != null) patch.title = params.title.trim();
  if (params.description !== undefined) patch.description = params.description;
  if (params.startsAt != null) patch.starts_at = params.startsAt;
  if (params.endsAt !== undefined) patch.ends_at = params.endsAt;

  const { data, error } = await supabaseAdmin
    .from("lead_calendar_events")
    .update(patch as never)
    .eq("id", params.eventId as never)
    .eq("agent_id", params.agentId as never)
    .select(
      "id,contact_id,title,description,starts_at,ends_at,timezone,status,calendar_provider,external_event_id,external_calendar_id,created_at,updated_at"
    )
    .single();

  if (error) throw new Error(error.message);

  // An event with no contact has nothing to name and no activity to touch —
  // and querying contacts for a null id is what broke the list query.
  if (!leadId) return mapEventRow(data as Record<string, unknown>, null);

  const { data: lead } = await supabaseAdmin
    .from("contacts")
    .select("name")
    .eq("id", leadId as never)
    .maybeSingle();

  const nm = (lead as { name?: unknown } | null)?.name;
  await touchLeadActivity(leadId);
  return mapEventRow(data as Record<string, unknown>, nm != null ? String(nm) : null);
}

export async function createMobileBookingLink(params: {
  agentId: string;
  leadId: string;
  bookingUrl: string;
  label?: string | null;
  shareMessage?: string | null;
  expiresAt?: string | null;
}): Promise<MobileBookingLinkDto> {
  await assertLeadOwned(params.agentId, params.leadId);
  const url = String(params.bookingUrl || "").trim();
  if (!url) throw new Error("INVALID_URL");

  const meta = {
    source: "mobile",
    created_via: "booking_link",
    at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("lead_booking_links")
    .insert({
      contact_id: params.leadId,
      agent_id: params.agentId,
      booking_url: url,
      label: params.label?.trim() || null,
      share_message: params.shareMessage?.trim() || null,
      expires_at: params.expiresAt ?? null,
      metadata_json: meta,
    } as never)
    .select("id,contact_id,booking_url,label,share_message,expires_at,created_at")
    .single();

  if (error) throw new Error(error.message);

  const { data: lead } = await supabaseAdmin
    .from("contacts")
    .select("name")
    .eq("id", params.leadId as never)
    .maybeSingle();

  const nm = (lead as { name?: unknown } | null)?.name;
  await touchLeadActivity(params.leadId);
  return mapBookingRow(data as Record<string, unknown>, nm != null ? String(nm) : null);
}
