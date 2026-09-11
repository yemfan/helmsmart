/**
 * AI activity — what the AI team did on the owner's behalf in the last week,
 * as one list on the dashboard.
 *
 * Pure: rows in, sentences out. `components/ai-activity.tsx` fetches; this
 * decides which rows are worth a line, whose work each one is, what it says
 * and where it links. Every line has one grammar — WHO (an AI employee, or
 * Auto Pilot, or an automatic send) · WHAT · LINK — and the copy comes
 * through the translator the caller passes, so nothing here is English.
 */

import { formatPhoneDisplay } from "@/lib/phone-display";

export type Translate = (key: string, opts?: Record<string, unknown>) => string;

export const ACTIVITY_WINDOW_DAYS = 7;
export const ACTIVITY_LIMIT = 8;

/** The AI employee each kind of work belongs to (one DNA module, one person). */
export const RECEPTIONIST_SLUG = "emma";
export const SALES_SLUG = "sarah";
export const MARKETING_SLUG = "emily";

/** Platform names are proper nouns, not copy. Anything else reads as "social media". */
const PLATFORM_NAMES: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  threads: "Threads",
  x: "X",
};

/** Outbound-call purposes with a label; a purpose not listed gets no detail rather than a raw key. */
const CALL_PURPOSES = new Set(["follow_up", "survey", "promo", "demo"]);

/**
 * `messages.sent_by` values that are AI work, and how the feed names them.
 * Values not listed (the owner, a campaign) are the owner's own sends and
 * stay out of a list about what the AI did.
 */
const TEXT_SENDERS: Record<string, "autoPilot"> = {
  auto_pilot: "autoPilot",
};

// ── Input rows (as selected by the component) ────────────────────────────────

export type VoiceSessionRow = {
  id: string;
  call_sid: string;
  direction: string | null;
  purpose: string | null;
  status: string;
  from_number: string | null;
  to_number: string | null;
  client_id: string | null;
  booked_event_id: string | null;
  created_at: string;
};

export type CallRow = {
  id: string;
  twilio_call_sid: string | null;
  from_number: string;
  client_id: string | null;
  status: string;
  auto_replied: boolean;
  called_at: string;
};

export type SocialPostRow = {
  id: string;
  platform: string;
  published_at: string | null;
  scheduled_at: string | null;
  generated_by_ai: boolean;
};

export type RunRow = {
  id: string;
  /** Resolved from `employee_id` by the caller. */
  employee_slug: string;
  channel: string | null;
  subject_type: string | null;
  subject_id: string | null;
  status: string;
  outcome: Record<string, unknown> | null;
  started_at: string;
};

export type QueueRow = {
  id: string;
  purpose: string;
  status: string;
  client_id: string;
  updated_at: string;
};

export type TextRow = {
  id: string;
  client_id: string | null;
  to_address: string | null;
  sent_by: string | null;
  sent_at: string;
};

export type ActivityInput = {
  voiceSessions: VoiceSessionRow[];
  calls: CallRow[];
  socialPosts: SocialPostRow[];
  runs: RunRow[];
  queue: QueueRow[];
  texts: TextRow[];
  /** client id → display name (see `clientDisplayName`); absent when there's no real name. */
  clientNames: Record<string, string>;
  /** event id → start time (ISO), for "booked Tue 3:00 PM". */
  eventStarts: Record<string, string>;
  /** employee slug → the name and avatar this business gave them. */
  employees: Record<string, { name: string; avatar: string }>;
};

export type ActivityFormat = {
  t: Translate;
  /** An appointment time in the business's timezone, e.g. "Tue 3:00 PM". */
  when: (iso: string) => string;
};

// ── Output ───────────────────────────────────────────────────────────────────

export type ActivityWho =
  | { kind: "employee"; slug: string; name: string; avatar: string }
  | { kind: "autoPilot" }
  | { kind: "automatic" };

export type ActivityRow = {
  key: string;
  at: string;
  who: ActivityWho;
  /** The sentence, subject included: "Emma answered a call from (415) 555-0143". */
  text: string;
  /** What came of it, shown after a middle dot: "booked Tue 3:00 PM". */
  detail: string | null;
  href: string;
  /** Something that didn't happen that should have — the one case worth colour. */
  tone?: "warning";
};

/**
 * A contact's name as the feed prints it, or null when there isn't a real one.
 * The receptionist files an unknown caller as "Caller" until they give a name;
 * that placeholder isn't a name, and their number says more.
 */
export function clientDisplayName(
  c: { first_name?: string | null; last_name?: string | null; company?: string | null } | null | undefined,
): string | null {
  if (!c) return null;
  const first = (c.first_name ?? "").trim();
  const last = (c.last_name ?? "").trim();
  if (first && first.toLowerCase() !== "caller") return last ? `${first} ${last}` : first;
  const company = (c.company ?? "").trim();
  return company || null;
}

export function buildActivityFeed(
  input: ActivityInput,
  fmt: ActivityFormat,
  opts: { now?: Date; limit?: number } = {},
): ActivityRow[] {
  const { t } = fmt;
  const now = opts.now ?? new Date();
  const since = now.getTime() - ACTIVITY_WINDOW_DAYS * 86_400_000;
  const rows: ActivityRow[] = [];

  const employee = (slug: string): Extract<ActivityWho, { kind: "employee" }> => {
    const e = input.employees[slug];
    return { kind: "employee", slug, name: e?.name ?? slug, avatar: e?.avatar ?? "" };
  };
  const person = (clientId: string | null, phone: string | null): string =>
    (clientId ? input.clientNames[clientId] : undefined) || formatPhoneDisplay(phone) || t("aiActivity.someone");

  // A call the receptionist didn't serve is logged in `calls` as missed or
  // voicemail (and texted back). Its voice session exists too, but "answered"
  // would be the wrong word for it.
  const unserved = new Set(
    input.calls.filter((c) => c.status !== "answered" && c.twilio_call_sid).map((c) => c.twilio_call_sid as string),
  );

  for (const s of input.voiceSessions) {
    if (s.status === "failed") continue;
    if (s.direction === "outbound") {
      const name = person(s.client_id, s.to_number);
      if (s.purpose === "appointment_reminder") {
        rows.push({
          key: `voice:${s.id}`,
          at: s.created_at,
          who: { kind: "automatic" },
          text: t("aiActivity.row.reminderCall", { name }),
          detail: null,
          href: "/client-assistant",
        });
      } else {
        const who = employee(SALES_SLUG);
        rows.push({
          key: `voice:${s.id}`,
          at: s.created_at,
          who,
          text: t("aiActivity.row.calledContact", { who: who.name, name }),
          detail: s.purpose && CALL_PURPOSES.has(s.purpose) ? t(`aiActivity.purpose.${s.purpose}`) : null,
          href: "/client-assistant",
        });
      }
      continue;
    }
    if (unserved.has(s.call_sid)) continue;
    const who = employee(RECEPTIONIST_SLUG);
    const start = s.booked_event_id ? input.eventStarts[s.booked_event_id] : undefined;
    rows.push({
      key: `voice:${s.id}`,
      at: s.created_at,
      who,
      text: t("aiActivity.row.answeredCall", { who: who.name, caller: person(s.client_id, s.from_number) }),
      detail: s.booked_event_id
        ? start
          ? t("aiActivity.detail.booked", { when: fmt.when(start) })
          : t("aiActivity.detail.bookedNoTime")
        : null,
      href: "/voice",
    });
  }

  for (const c of input.calls) {
    if (!c.auto_replied) continue;
    rows.push({
      key: `call:${c.id}`,
      at: c.called_at,
      who: { kind: "automatic" },
      text: t("aiActivity.row.missedCallText", { caller: person(c.client_id, c.from_number) }),
      detail: null,
      href: "/voice",
    });
  }

  // Only posts the schedule published: an AI-written post the owner published
  // by hand was the owner's act, and this list is about what the AI did.
  for (const p of input.socialPosts) {
    if (!p.generated_by_ai || !p.scheduled_at || !p.published_at) continue;
    const who = employee(MARKETING_SLUG);
    rows.push({
      key: `post:${p.id}`,
      at: p.published_at,
      who,
      text: t("aiActivity.row.published", {
        who: who.name,
        platform: PLATFORM_NAMES[p.platform] ?? t("aiActivity.platformGeneral"),
      }),
      detail: null,
      href: "/social",
    });
  }

  for (const r of input.runs) {
    // A voice run is the call itself, which already has its own line.
    if (r.channel === "voice") continue;
    const who = employee(r.employee_slug);
    const name = r.subject_type === "contact" && r.subject_id ? person(r.subject_id, null) : null;
    if (r.status === "escalated") {
      const text =
        r.channel === "sms" && name
          ? t("aiActivity.row.draftedForApproval", { who: who.name, name })
          : r.channel === "email" && r.subject_type === "invoice"
            ? t("aiActivity.row.remindersForApproval", { who: who.name })
            : t("aiActivity.row.waitingApproval", { who: who.name });
      rows.push({ key: `run:${r.id}`, at: r.started_at, who, text, detail: null, href: "/tasks" });
    } else if (r.status === "succeeded" && r.channel === "sms" && r.outcome?.booked === true && name) {
      rows.push({
        key: `run:${r.id}`,
        at: r.started_at,
        who,
        text: t("aiActivity.row.bookedByText", { who: who.name, name }),
        detail: null,
        href: "/calendar",
      });
    }
  }

  // A placed call ("done") is already a voice-session line; the queue adds
  // what only it knows — reminder texts, and calls that never went out.
  for (const q of input.queue) {
    const name = person(q.client_id, null);
    if (q.purpose === "appointment_reminder_sms") {
      if (q.status === "done") {
        rows.push({
          key: `queue:${q.id}`,
          at: q.updated_at,
          who: { kind: "automatic" },
          text: t("aiActivity.row.reminderText", { name }),
          detail: null,
          href: "/calendar",
        });
      } else if (q.status === "failed") {
        rows.push({
          key: `queue:${q.id}`,
          at: q.updated_at,
          who: { kind: "automatic" },
          text: t("aiActivity.row.reminderTextNotSent", { name }),
          detail: null,
          href: "/client-assistant",
          tone: "warning",
        });
      }
    } else if (q.status === "failed") {
      if (q.purpose === "appointment_reminder") {
        rows.push({
          key: `queue:${q.id}`,
          at: q.updated_at,
          who: { kind: "automatic" },
          text: t("aiActivity.row.reminderCallNotPlaced", { name }),
          detail: null,
          href: "/client-assistant",
          tone: "warning",
        });
      } else {
        const who = employee(SALES_SLUG);
        rows.push({
          key: `queue:${q.id}`,
          at: q.updated_at,
          who,
          text: t("aiActivity.row.callNotPlaced", { who: who.name, name }),
          detail: null,
          href: "/client-assistant",
          tone: "warning",
        });
      }
    }
  }

  // One line per conversation, not per text: five Auto Pilot replies to one
  // person are one thing that happened.
  const threads = new Map<string, { latest: TextRow; count: number }>();
  for (const m of input.texts) {
    if (!m.sent_by || !TEXT_SENDERS[m.sent_by]) continue;
    const k = `${m.sent_by}:${m.client_id ?? m.to_address ?? m.id}`;
    const g = threads.get(k);
    if (!g) threads.set(k, { latest: m, count: 1 });
    else {
      g.count += 1;
      if (Date.parse(m.sent_at) > Date.parse(g.latest.sent_at)) g.latest = m;
    }
  }
  for (const { latest, count } of threads.values()) {
    rows.push({
      key: `text:${latest.id}`,
      at: latest.sent_at,
      who: { kind: "autoPilot" },
      text: t("aiActivity.row.autoPilotReplied", { name: person(latest.client_id, latest.to_address) }),
      detail: count > 1 ? t("aiActivity.detail.texts", { count }) : null,
      href: "/inbox",
    });
  }

  return rows
    .filter((r) => {
      const ms = Date.parse(r.at);
      return Number.isFinite(ms) && ms >= since;
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, opts.limit ?? ACTIVITY_LIMIT);
}
