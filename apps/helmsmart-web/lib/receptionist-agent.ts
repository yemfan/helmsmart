import { createServiceClient } from "@/lib/supabase/server";
import { createNotificationService } from "@/lib/actions/notifications";
import { getAvailability, bookAppointment, matchOrCreateClient } from "@/lib/booking";
import { recordEmmaBooking } from "@/lib/workforce-attribution";
import { describeHours, defaultBusinessHours, type BusinessHours, type AppointmentType, type KnowledgeEntry } from "@/lib/receptionist";
import twilio from "twilio";
import { twilioSender } from "@/lib/twilio-sender";
import type { ReceptionistContext } from "@repo/voice/prompt";
import { safeTimezone, todayInTimezone } from "@repo/voice/datetime";
import { phoneLast10 } from "@repo/voice/phone";
import { GENERAL_BUSINESS_PROFILE } from "@repo/voice/vertical";
import {
  NO_UPCOMING_APPOINTMENT_TEXT,
  UNSUPPORTED_TOOL_TEXT,
  existingAppointmentsText,
} from "@repo/voice/tools";

/**
 * The receptionist's shared brain — transport-agnostic.
 *
 * The pure prompt builders + the ReceptionistContext type now live in the shared
 * @repo/voice package and are re-exported here, so existing
 * "@/lib/receptionist-agent" imports keep working. The DB/tenant-coupled
 * functions (load context, resolve org, run tools, booking side-effects) stay
 * app-specific and live below.
 */
export * from "@repo/voice/prompt";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

// ─── Per-org context ────────────────────────────────────────────────────────────

/** Load the structured brain (hours, appointment types, knowledge) for an org. */
export async function loadReceptionistContext(db: ServiceClient, orgId: string): Promise<ReceptionistContext> {
  const [{ data: org }, { data: types }, { data: knowledge }] = await Promise.all([
    db.from("organizations").select("name, twilio_number, voice_agent_prompt, voice_agent_greeting, voice_agent_name, voice_agent_business_name, voice_agent_business_name_zh, timezone, business_hours").eq("id", orgId).single(),
    db.from("appointment_types").select("name, duration_minutes, description").eq("organization_id", orgId).eq("active", true).order("sort"),
    db.from("knowledge_base").select("title, content").eq("organization_id", orgId).eq("active", true).order("sort"),
  ]);

  // safeTimezone, not `|| default`: a typo saved in Settings ("America/Los_Angles")
  // makes every Intl call below throw, and on the inbound hot path that means the
  // caller gets no prompt at all.
  const timezone = safeTimezone(org?.timezone as string | null);
  const { iso: todayISO, label: todayLabel } = todayInTimezone(timezone);

  const typesText = (types ?? []).length
    ? (types as AppointmentType[]).map((t) => `- ${t.name} (${t.duration_minutes} min)${t.description ? `: ${t.description}` : ""}`).join("\n")
    : "None configured — if asked to book, offer a call-back instead.";
  const knowledgeText = (knowledge ?? []).length
    ? (knowledge as KnowledgeEntry[]).map((k) => `### ${k.title}\n${k.content}`).join("\n\n")
    : "";
  // Fall back to Mon–Fri 9–5 rather than "not set". An org with no hours used to
  // be told to the caller as "Business hours not set." while the booking engine
  // treated null as "never open" — so the receptionist offered to book and then
  // called every single date closed. One default, used by both, ends that.
  const hoursText = describeHours((org?.business_hours as BusinessHours | null) ?? defaultBusinessHours());

  // The business name the agent SAYS — a per-business override (brand/DBA) that
  // falls back to the legal org name. The Chinese name is used when the agent
  // speaks Chinese, falling back to the English/display name. (The legal name
  // stays in Settings for invoices, etc.)
  const displayName = (org?.voice_agent_business_name as string)?.trim() || (org?.name as string) || "this business";
  const displayNameZh = (org?.voice_agent_business_name_zh as string)?.trim() || displayName;

  // Deliver the opening greeting in English first, then a standard Chinese greeting,
  // so bilingual callers are welcomed in both languages. The English half is the
  // org's own "Opening greeting" (unchanged); {{business_name_zh}} resolves to the
  // Chinese business name when one is defined, otherwise the English display name.
  const englishGreeting = (org?.voice_agent_greeting as string)?.trim() || "Hello! Thank you for calling. How can I help you today?";
  const greeting = `${englishGreeting} 您好，感谢致电{{business_name_zh}}，请问有什么可以帮您？`;

  return {
    orgId,
    // HelmSmart is industry-agnostic — its tenants are plumbers, clinics, firms.
    // The neutral profile keeps the receptionist from telling a plumbing caller
    // it cannot say what a home is worth. It is also the package default; naming
    // it here is documentation, and the swap point when a pack or an org setting
    // starts choosing the vertical (see verticalProfile()).
    profile: GENERAL_BUSINESS_PROFILE,
    orgName: displayName,
    orgNameZh: displayNameZh,
    agentName: ((org?.voice_agent_name as string) || "").trim(),
    twilioNumber: (org?.twilio_number as string | null) ?? null,
    timezone,
    todayISO,
    todayLabel,
    hoursText,
    typesText,
    knowledgeText,
    extraNotes: (org?.voice_agent_prompt as string) || "",
    greeting,
  };
}

/** The org a dialed number belongs to, plus whether its receptionist is on. */
export type InboundOrg = { id: string; voiceAgentEnabled: boolean };

/** Resolve the org behind a dialed (business) phone number.
 *
 * Matches on the last 10 digits so formatting differences (+1 prefix, spaces,
 * dashes) never silently break booking — a phone-format mismatch used to make
 * the agent say it couldn't reach the booking system.
 *
 * The result is ORDERED, which matters: two orgs can hold the same number (a
 * number moved between tenants and the old row kept it). This used to be an
 * `.eq(...).maybeSingle()` — which ERRORS on two rows rather than picking one —
 * followed by an unordered `limit(1)`, so the winner was whatever Postgres
 * happened to return first and could flip after any unrelated row update. A
 * caller would then reach a different business than the one that owns the
 * number. Prefer the org whose receptionist is actually switched on, then the
 * oldest, so the answer is stable and is the tenant in service.
 */
export async function resolveInboundOrg(db: ServiceClient, toNumber: string): Promise<InboundOrg | null> {
  if (!toNumber) return null;

  const last10 = phoneLast10(toNumber);
  const query = db.from("organizations").select("id, voice_agent_enabled");
  const { data: rows } = await (last10
    ? query.ilike("twilio_number", `%${last10}`)
    : query.eq("twilio_number", toNumber)
  )
    .order("voice_agent_enabled", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(5);

  const matches = (rows ?? []) as { id: string; voice_agent_enabled: boolean | null }[];
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    // Not fatal — we pick deterministically — but it is always a data problem
    // worth someone's attention, so say so rather than resolving in silence.
    console.warn(
      `[receptionist] ${matches.length} orgs share the number ${toNumber}: ` +
        `${matches.map((m) => m.id).join(", ")}. Serving ${matches[0].id}.`
    );
  }
  return { id: matches[0].id, voiceAgentEnabled: Boolean(matches[0].voice_agent_enabled) };
}

/** Org id only — for callers that don't care about the enabled flag. */
export async function findOrgIdByNumber(db: ServiceClient, toNumber: string): Promise<string | null> {
  return (await resolveInboundOrg(db, toNumber))?.id ?? null;
}

export type NumberSharing = {
  /** The org's own number, or null when it has none. */
  number: string | null;
  /** How many OTHER organizations claim the same number. */
  sharedWith: number;
  /** Whether an inbound call to it would actually be served as THIS org. */
  answersThisOrg: boolean;
};

/**
 * Whether this org's number is really its own — and whether calls to it are
 * answered as this org at all.
 *
 * A phone number is the only routing information an inbound call carries, so
 * when several organizations claim the same one, resolveInboundOrg has to pick:
 * voice-enabled first, then the oldest row. That pick is deterministic and it
 * is also invisible. An owner who typed their business details into Settings
 * and saw a green "Connected to +1 626 888 8685" had no way to learn that calls
 * to it were being answered as a different business, with that business's
 * appointment types and knowledge base. The only way to find out was to phone
 * in and listen — which is exactly how it was found.
 *
 * The count is reported but the other businesses are NOT named: the owner needs
 * to know their number is shared and whether they are the one answering, and
 * neither of those requires disclosing another tenant's identity. The server
 * log in /api/retell/inbound names the org for whoever is operating the
 * platform.
 *
 * Deliberately mirrors resolveInboundOrg's ordering. If the two ever disagree,
 * this reassures an owner about behaviour the call path does not actually have.
 */
export async function describeNumberSharing(
  db: ServiceClient,
  orgId: string,
): Promise<NumberSharing> {
  const { data: mine } = await db
    .from("organizations")
    .select("twilio_number")
    .eq("id", orgId)
    .maybeSingle();

  const number = ((mine as { twilio_number?: string | null } | null)?.twilio_number ?? "").trim() || null;
  if (!number) return { number: null, sharedWith: 0, answersThisOrg: false };

  const last10 = phoneLast10(number);
  const query = db.from("organizations").select("id, voice_agent_enabled");
  const { data: rows } = await (last10
    ? query.ilike("twilio_number", `%${last10}`)
    : query.eq("twilio_number", number)
  )
    .order("voice_agent_enabled", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true })
    // resolveInboundOrg caps at 5 because it only needs the winner. Here the
    // count is the point, so allow for more before it stops being countable.
    .limit(50);

  const claimants = (rows ?? []) as { id: string }[];
  if (claimants.length === 0) {
    // Our own row should always match. If it does not, the number is stored in
    // a shape phoneLast10 cannot read, which is its own problem — say "not
    // shared" rather than invent a warning.
    return { number, sharedWith: 0, answersThisOrg: true };
  }

  return {
    number,
    sharedWith: Math.max(0, claimants.length - 1),
    answersThisOrg: claimants[0].id === orgId,
  };
}

// ─── Tools ────────────────────────────────────────────────────────────────────────

export type ToolResult = { text: string; bookedEventId?: string; bookedNote?: string; bookedLabel?: string; bookedRescheduleToken?: string };
export type ToolCtx = { db: ServiceClient; orgId: string; fromNumber: string };

/**
 * Upcoming appointments for THIS caller, soonest first.
 *
 * Matched on the last ten digits of the phone, not an exact string: a client
 * added by hand may be stored as "(626) 755-7917" while the caller ID arrives as
 * "+16267557917", and an exact match finds neither. Cancellation hard-deletes the
 * row, so anything still here and still in the future is live.
 */
async function upcomingForCaller(
  db: ServiceClient,
  orgId: string,
  fromNumber: string
): Promise<{ title: string | null; start_at: string }[]> {
  const last10 = phoneLast10(fromNumber);
  if (!last10) return [];

  const { data: clients } = await db
    .from("clients")
    .select("id")
    .eq("organization_id", orgId)
    .ilike("phone", `%${last10}`);
  const ids = (clients ?? []).map((c) => c.id as string);
  if (ids.length === 0) return [];

  const { data } = await db
    .from("events")
    .select("title, start_at")
    .eq("organization_id", orgId)
    .eq("type", "appointment")
    .in("client_id", ids)
    .gte("start_at", new Date().toISOString())
    .order("start_at", { ascending: true })
    .limit(10);
  return (data ?? []) as { title: string | null; start_at: string }[];
}

/** Execute one receptionist tool. Returns a natural-language result for the LLM. */
export async function runReceptionistTool(name: string, input: unknown, ctx: ToolCtx): Promise<ToolResult> {
  const args = (input ?? {}) as Record<string, unknown>;

  if (name === "check_availability") {
    const date = String(args.date ?? "");
    const type = String(args.appointment_type ?? "");
    const res = await getAvailability(ctx.orgId, type, date);
    if (res.closed) return { text: `Closed on ${date}. Offer a different day within business hours.` };
    if (res.slots.length === 0) return { text: `No open ${res.durationMinutes}-minute slots on ${date}. Suggest another day.` };
    return {
      text:
        `Open slots (offer these to the caller; book with the exact "start"):\n` +
        res.slots.map((s) => `- ${s.label} → start: ${s.startISO}`).join("\n"),
    };
  }

  if (name === "book_appointment") {
    // Accept either our canonical params (appointment_type/start) or the ones the
    // Retell function template actually sends (service_type/date/time).
    const type = String(args.appointment_type ?? args.service_type ?? "");
    const start = String(args.start ?? "");
    const dateStr = String(args.date ?? "");
    const timeStr = String(args.time ?? "");
    const callerName = args.caller_name ? String(args.caller_name) : null;
    const clientId = await matchOrCreateClient(ctx.orgId, ctx.fromNumber, callerName);
    const res = await bookAppointment(ctx.orgId, { appointmentTypeName: type, startISO: start, dateStr, timeStr, clientId, callerName });
    if (!res.ok) return { text: `Could not book: ${res.reason} Offer to check another time with check_availability.` };
    // Attribute the booking to Emma for the Command Center (best-effort; never blocks).
    await recordEmmaBooking(ctx.db, ctx.orgId);
    return {
      text: `Booked: ${res.title} on ${res.label}. Confirm this back to the caller.`,
      bookedEventId: res.eventId,
      bookedNote: `${res.title} on ${res.label} (from ${ctx.fromNumber})`,
      bookedLabel: res.label,
      bookedRescheduleToken: res.rescheduleToken,
    };
  }

  if (name === "create_callback") {
    const reason = String(args.reason ?? "Call back requested");
    const callerName = args.caller_name ? String(args.caller_name) : null;
    const clientId = await matchOrCreateClient(ctx.orgId, ctx.fromNumber, callerName);
    await ctx.db.from("tasks").insert({
      organization_id: ctx.orgId,
      client_id: clientId,
      title: `Call back ${callerName || ctx.fromNumber}`,
      notes: `From ${ctx.fromNumber}: ${reason}`,
      due_date: new Date().toISOString().slice(0, 10),
      priority: "high",
      status: "open",
    });
    await createNotificationService(ctx.orgId, {
      type: "missed_call",
      title: "Call-back requested",
      body: `${callerName || ctx.fromNumber}: ${reason}`.slice(0, 120),
      link: "/tasks",
    });
    return { text: "Let the caller know someone from the team will call them back." };
  }

  // The shared prompt tells the agent to call this FIRST whenever a caller
  // mentions an appointment they already have. Without it the call fell through
  // to the catch-all below and answered "Done." — so the agent, told never to
  // answer from memory and given nothing to answer from, would book a second
  // appointment to stand in for the one it could not see.
  if (name === "lookup_appointment") {
    const rows = await upcomingForCaller(ctx.db, ctx.orgId, ctx.fromNumber);
    if (rows.length === 0) return { text: NO_UPCOMING_APPOINTMENT_TEXT };

    const { data: org } = await ctx.db.from("organizations").select("timezone").eq("id", ctx.orgId).maybeSingle();
    // "the team" — HelmSmart is industry-agnostic, so there is no Realtor to
    // name. The only word that differs from CloseBoss's copy of this answer.
    return { text: existingAppointmentsText(rows, safeTimezone(org?.timezone as string | null), "the team") };
  }

  return { text: UNSUPPORTED_TOOL_TEXT };
}

// ─── Booking side-effects (shared by both transports) ─────────────────────────────

/**
 * On a successful booking: notify the owner and text the caller a confirmation
 * (logged to the inbox). Best-effort — wrapped so a failed SMS never breaks the
 * call. Intended to be invoked from a route's `after()` so it never adds latency.
 */
export async function notifyBooking(
  db: ServiceClient,
  org: { orgId: string; orgName: string; twilioNumber: string | null },
  callerNumber: string,
  booked: { bookedNote?: string | null; bookedLabel?: string | null; rescheduleToken?: string | null }
): Promise<void> {
  if (!booked.bookedNote) return;

  await createNotificationService(org.orgId, {
    type: "booking",
    title: "Appointment booked by the receptionist",
    body: booked.bookedNote,
    link: "/calendar",
  });

  // Not gated on org.twilioNumber any more: with a Messaging Service configured
  // the send doesn't need one, and the receptionist may well be answering on a
  // voice-only number.
  const sender = twilioSender(org.twilioNumber);
  if (!sender || !booked.bookedLabel) return;

  const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);

  /** Send one SMS and record it, without letting a failure end the booking. */
  const send = async (to: string, body: string, clientId: string | null) => {
    try {
      const sms = await client.messages.create({ ...sender, to, body });
      await db.from("messages").insert({
        organization_id: org.orgId,
        client_id: clientId,
        channel: "sms",
        direction: "outbound",
        from_address: org.twilioNumber ?? "messaging-service",
        to_address: to,
        body,
        read: true,
        external_id: sms.sid,
        sent_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error("[receptionist] booking SMS error:", to, e);
    }
  };

  // ── The caller ──
  if (callerNumber) {
    const link = booked.rescheduleToken ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/reschedule/${booked.rescheduleToken}` : "";
    // Give them a phone number, not only a link and a keyword. "Reply CANCEL"
    // fails silently for anyone who deletes the text, and a reschedule link is
    // useless to a caller who is driving. The number they just rang is the one
    // they will think to ring again, and the receptionist can look the
    // appointment up and move it.
    const callBack = org.twilioNumber ? ` or call ${displayPhone(org.twilioNumber)}` : "";
    const body =
      `You're confirmed for ${booked.bookedLabel}. See you then! — ${org.orgName}` +
      `\nTo reschedule or cancel, reply CANCEL${link ? `, use ${link}` : ""}${callBack}.`;
    await send(callerNumber, body, await matchOrCreateClient(org.orgId, callerNumber));
  }

  // ── The business ──
  // The in-app notification above is only seen by someone looking at the app.
  // An owner on a roof learned about an 11am appointment by arriving at 11am.
  const { data: orgRow } = await db
    .from("organizations")
    .select("booking_alert_phone")
    .eq("id", org.orgId)
    .maybeSingle();
  const alertTo = ((orgRow as { booking_alert_phone?: string | null } | null)?.booking_alert_phone ?? "").trim();
  if (alertTo) {
    const who = callerNumber ? ` Caller: ${displayPhone(callerNumber)}.` : "";
    // client_id null on purpose: this is a message to the business about a
    // client, not a message to that client. Threading it under the caller
    // would put the owner's own alert in the caller's conversation.
    await send(alertTo, `New appointment booked by your AI receptionist: ${booked.bookedLabel}.${who}`, null);
  }
}

/** `+16268888685` → `(626) 888-8685`. For reading, not for TTS — see formatPhoneForSpeech. */
function displayPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw;
}
