/**
 * The AI Receptionist's numbers — ONE definition, shared by the stat cards on
 * /voice and the call list beneath them, so the two cannot disagree.
 *
 * WHERE A CALL LIVES. An inbound call can leave a row in two tables:
 *
 *   - `voice_sessions` (direction = 'inbound') — every call the AI receptionist
 *     picked up. Retell's webhook upserts it by `call_sid` on call_started /
 *     call_ended / call_analyzed, with the transcript, duration, summary and
 *     recording; the booking tool stamps `booked_event_id` on it. This table also
 *     holds the OUTBOUND calls the AI Client Assistant places, which is why every
 *     read here filters on direction.
 *   - `calls` — the missed-call log. The Retell webhook inserts a row when the
 *     caller wasn't served (voicemail, error, hung up before speaking) and texts
 *     them back; the plain Twilio fallback number logs every call it takes as
 *     missed. `twilio_call_sid` holds whichever id the call came in with, so a
 *     Retell text-back row carries the SAME id as its voice session.
 *
 * So the two join on call SID, and each call is presented once. Which table is
 * authoritative for what:
 *
 *   - answered by the AI  → voice_sessions: the caller spoke, or a booking exists
 *   - appointments booked → voice_sessions.booked_event_id
 *   - messages taken      → voice_sessions: the caller spoke, nothing was booked
 *   - missed              → calls.status missed | voicemail, plus AI sessions
 *                           where the caller hung up before saying anything
 *   - minutes             → voice_sessions.duration_seconds (the AI's talk time)
 *   - texted back         → calls.auto_replied
 *
 * Pure and dependency-light on purpose: lib/voice-window fetches, this decides.
 */

import { addDaysISO, safeTimezone, todayInTimezone } from "@repo/voice/datetime";

/** The window every number on /voice describes. Labelled on the page. */
export const VOICE_PERIOD_DAYS = 30;

/**
 * What a minute of AI voice costs the customer. lib/voice-billing.ts bills
 * from this constant and billableMinutes(), so the estimate on the page is the
 * same arithmetic as the invoice line.
 */
export const VOICE_RATE_CENTS_PER_MINUTE = 10;

/** Minutes billed for one call: rounded UP to the whole minute, per call. */
export function billableMinutes(seconds: number | null | undefined): number {
  const s = Number(seconds) || 0;
  return s > 0 ? Math.ceil(s / 60) : 0;
}

/** Talk time in minutes to one decimal, for display (61s → 1.0, 90s → 1.5). */
export function talkMinutes(seconds: number): number {
  return seconds > 0 ? Math.round(seconds / 6) / 10 : 0;
}

/** Offset of `timeZone` from UTC at instant `at`, in ms (DST-aware). */
function tzOffsetMs(timeZone: string, at: Date): number {
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at)) {
    parts[p.type] = p.value;
  }
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return asUtc - at.getTime();
}

/**
 * The UTC instant of local midnight on `dateIso` in `timeZone`.
 *
 * Two passes, because the offset has to be read at the answer, not at the
 * guess: on a DST-change day in a zone east of UTC (Sydney, early April) the
 * naive guess lands after the switch and one pass is an hour out.
 */
export function startOfDayUtc(dateIso: string, timeZone: string): Date {
  const naive = Date.parse(`${dateIso}T00:00:00Z`);
  const first = naive - tzOffsetMs(timeZone, new Date(naive));
  return new Date(naive - tzOffsetMs(timeZone, new Date(first)));
}

/**
 * Start of the reporting window: local midnight, `days - 1` days before today,
 * in the business's own timezone — so "last 30 days" is today plus the 29 days
 * before it, as the owner's calendar counts them. An unset or invalid timezone
 * falls back the same way the receptionist's booking flow does.
 */
export function voicePeriodStart(
  timeZone: string | null | undefined,
  days: number = VOICE_PERIOD_DAYS,
  now: Date = new Date(),
): Date {
  const tz = safeTimezone(timeZone);
  const today = todayInTimezone(tz, now).iso;
  return startOfDayUtc(addDaysISO(today, -(Math.max(1, days) - 1)), tz);
}

export type SessionLike = {
  id: string;
  call_sid: string | null;
  created_at: string;
  status?: string | null;
  booked_event_id?: string | null;
  duration_seconds?: number | null;
  /** The caller said at least one thing to the AI. */
  spoke: boolean;
};

export type CallLike = {
  id: string;
  twilio_call_sid: string | null;
  called_at: string;
  status: string | null;
  auto_replied?: boolean | null;
};

export type MergedCall<S extends SessionLike = SessionLike, C extends CallLike = CallLike> = {
  key: string;
  /** When the call came in. */
  at: string;
  session: S | null;
  call: C | null;
};

/**
 * One row per call. A voice session and a `calls` row with the same SID are the
 * same phone call seen by two writers; everything else stands alone. Newest
 * first.
 */
export function mergeCallLog<S extends SessionLike, C extends CallLike>(
  sessions: S[],
  calls: C[],
): MergedCall<S, C>[] {
  const bySid = new Map<string, MergedCall<S, C>>();
  const out: MergedCall<S, C>[] = [];

  for (const s of sessions) {
    const row: MergedCall<S, C> = { key: `s:${s.id}`, at: s.created_at, session: s, call: null };
    out.push(row);
    if (s.call_sid) bySid.set(s.call_sid, row);
  }
  for (const c of calls) {
    const match = c.twilio_call_sid ? bySid.get(c.twilio_call_sid) : undefined;
    if (match && !match.call) {
      match.call = c;
      continue;
    }
    out.push({ key: `c:${c.id}`, at: c.called_at, session: null, call: c });
  }

  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export type CallOutcome = "booked" | "message" | "missed" | "voicemail" | "answered" | "inProgress";

/**
 * What happened on a call, as the owner would say it. Precedence:
 *
 *   1. a booking exists                         → booked
 *   2. the missed-call log says missed/voicemail → that (it is how the webhook
 *      recorded a voicemail or an errored call, even if "turns" were exchanged
 *      with an answering machine)
 *   3. the caller spoke to the AI                → message taken
 *   4. the AI call is still live                 → in progress
 *   5. the AI picked up but the caller said nothing → missed
 *   6. answered on the plain line                → answered
 */
export function classifyCall(row: Pick<MergedCall, "session" | "call">): CallOutcome {
  const { session, call } = row;
  if (session?.booked_event_id) return "booked";
  if (call?.status === "voicemail") return "voicemail";
  if (call?.status === "missed") return "missed";
  if (session?.spoke) return "message";
  if (session?.status === "active") return "inProgress";
  if (session) return "missed";
  if (call?.status === "answered") return "answered";
  return "missed";
}

export type VoiceStats = {
  totalCalls: number;
  /** booked + messagesTaken — calls the AI actually talked through. */
  answeredByAi: number;
  booked: number;
  messagesTaken: number;
  /** Missed + voicemail + hung up before speaking. */
  missed: number;
  /** Missed calls that got the auto-text. */
  autoTexted: number;
  talkSeconds: number;
  billableMinutes: number;
  estCostCents: number;
};

/** Every number on the page, from the complete set of calls in the window. */
export function summarizeCalls(rows: Pick<MergedCall, "session" | "call">[]): VoiceStats {
  const stats: VoiceStats = {
    totalCalls: rows.length,
    answeredByAi: 0,
    booked: 0,
    messagesTaken: 0,
    missed: 0,
    autoTexted: 0,
    talkSeconds: 0,
    billableMinutes: 0,
    estCostCents: 0,
  };

  for (const row of rows) {
    const outcome = classifyCall(row);
    if (outcome === "booked") stats.booked++;
    else if (outcome === "message") stats.messagesTaken++;
    else if (outcome === "missed" || outcome === "voicemail") stats.missed++;

    if (row.call?.auto_replied) stats.autoTexted++;

    const seconds = Number(row.session?.duration_seconds) || 0;
    if (seconds > 0) {
      stats.talkSeconds += seconds;
      stats.billableMinutes += billableMinutes(seconds);
    }
  }

  stats.answeredByAi = stats.booked + stats.messagesTaken;
  stats.estCostCents = stats.billableMinutes * VOICE_RATE_CENTS_PER_MINUTE;
  return stats;
}
