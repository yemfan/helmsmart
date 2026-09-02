/**
 * Shared date/time parsing + formatting for the voice agent's booking flow.
 *
 * Pure, timezone-aware (no external lib), and model-agnostic — a voice caller
 * speaks dates/times in many forms (ISO, weekday names, "tomorrow", spoken
 * words, Chinese), so every app's booking engine reuses the exact same parsing.
 */

import { DAY_KEYS, type DayKey } from "./brain";

/** Fallback when a tenant has no timezone set, or set an invalid one. */
export const DEFAULT_VOICE_TIMEZONE = "America/New_York";

/**
 * Validate a user-entered IANA timezone, falling back rather than throwing.
 *
 * A typo ("America/Los_Angles") makes every Intl call in the booking flow throw
 * a RangeError, which on the inbound hot path means the caller gets no prompt at
 * all. One bad character in a settings field should not take the receptionist
 * off the air.
 */
export function safeTimezone(tz: string | undefined | null): string {
  const v = (tz || "").trim();
  if (v) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: v });
      return v;
    } catch {
      /* invalid tz — fall through to the default */
    }
  }
  return DEFAULT_VOICE_TIMEZONE;
}

/**
 * "Today" in the tenant's timezone, in both forms the prompt needs: the ISO date
 * the agent does date math against, and the spoken label it reads out.
 */
export function todayInTimezone(timeZone: string, now: Date = new Date()): { iso: string; label: string } {
  return {
    iso: new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now),
    label: new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(now),
  };
}

/**
 * A spoken-friendly instant, e.g. "Tuesday, June 10 at 2 PM".
 *
 * `speakTime` drops the ":00" so TTS says "two PM" rather than "two zero zero
 * PM". Every place that reads an appointment time back to a caller — booking
 * confirmations, availability, the existing-appointment lookup — must produce
 * the identical string, or the same appointment gets described two ways in one
 * call.
 */
export function spokenDateTimeLabel(when: Date | number | string, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return speakTime(fmt.format(new Date(when)));
}

/** Offset (ms) of `timeZone` at instant `at`, DST-aware (no external lib). */
function tzOffsetMs(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const m: Record<string, string> = {};
  for (const p of dtf.formatToParts(at)) m[p.type] = p.value;
  const asUtc = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second);
  return asUtc - at.getTime();
}

/** Wall-clock date+time in `timeZone` → UTC Date. */
export function zonedToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const naive = new Date(`${dateStr}T${timeStr}:00Z`);
  return new Date(naive.getTime() - tzOffsetMs(timeZone, naive));
}

export function weekdayKey(dateStr: string): DayKey {
  const day = new Date(`${dateStr}T12:00:00Z`).getUTCDay(); // 0=Sun … 6=Sat
  return day === 0 ? "sun" : DAY_KEYS[day - 1];
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const pad2 = (n: number) => String(n).padStart(2, "0");

/** Drop ":00" on whole-hour times so the agent says "eleven AM", not the
 *  literal "eleven zero zero AM" that text-to-speech reads from "11:00 AM". */
export const speakTime = (label: string) => label.replace(/:00(\s*[AP]M)/, "$1");

/** Add `days` to a YYYY-MM-DD calendar date (UTC-anchored, tz-neutral). */
export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Best-effort: turn whatever the agent passes into a YYYY-MM-DD calendar date.
 * The LLM is told to send YYYY-MM-DD, but in practice it also sends weekday
 * names ("Monday"), relative terms ("tomorrow"), and natural dates
 * ("June 1, 2026"). Anything but strict ISO used to hit `new Date("Monday"…)`
 * → NaN → falsely "closed", so availability silently failed. Falls back to
 * `todayISO` when truly unparseable.
 */
export function normalizeDateStr(input: string, todayISO: string): string {
  const s = (input || "").trim();
  if (!s) return todayISO;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const lower = s.toLowerCase();
  if (lower === "today" || lower === "now") return todayISO;
  if (lower === "tomorrow") return addDaysISO(todayISO, 1);
  if (lower === "day after tomorrow" || lower === "overmorrow") return addDaysISO(todayISO, 2);

  // Weekday name (optionally "next …"): soonest date on/after today that matches.
  const wd = WEEKDAYS.findIndex((d) => new RegExp(`(^|\\b)(next\\s+)?${d}(\\b|$)`).test(lower));
  if (wd >= 0) {
    const todayDow = new Date(`${todayISO}T12:00:00Z`).getUTCDay();
    let delta = (wd - todayDow + 7) % 7;
    if (delta === 0 && /\bnext\b/.test(lower)) delta = 7; // "next Monday" while it's Monday
    return addDaysISO(todayISO, delta);
  }

  // Chinese relative + numeric dates: 今天/明天/后天, "6月2日", "2026年6月2日".
  if (/今天|今日/.test(s)) return todayISO;
  if (/明天|明日/.test(s)) return addDaysISO(todayISO, 1);
  if (/后天/.test(s)) return addDaysISO(todayISO, 2);
  const cn = s.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]/);
  if (cn) {
    const curYear = parseInt(todayISO.slice(0, 4), 10);
    const y = cn[1] ? parseInt(cn[1], 10) : curYear;
    const iso = `${y}-${pad2(parseInt(cn[2], 10))}-${pad2(parseInt(cn[3], 10))}`;
    return cn[1] || iso >= todayISO ? iso : `${y + 1}-${iso.slice(5)}`;
  }

  // Natural-language / numeric dates ("June 1, 2026", "06/01/2026", "Jun 1", "6/2").
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const md = `${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
    // If the string has no explicit 4-digit year, `new Date` defaults to a bogus
    // (often past) year → every slot reads as "in the past". Anchor month/day to
    // the current year, rolling to next year if that date has already passed.
    if (!/\b\d{4}\b/.test(s)) {
      const curYear = parseInt(todayISO.slice(0, 4), 10);
      const thisYear = `${curYear}-${md}`;
      return thisYear >= todayISO ? thisYear : `${curYear + 1}-${md}`;
    }
    return `${parsed.getFullYear()}-${md}`;
  }

  return todayISO; // unparseable → today; the agent can re-ask
}

const WORD_HOURS: Record<string, number> = {
  twelve: 12, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
};

/** Parse a spoken/written time into "HH:MM" (24h). Handles digit forms
 *  ("10:00 AM", "10am", "2 pm", "5:30pm", "17:00", "10") AND spoken forms a
 *  voice caller actually uses ("eleven", "eleven thirty", "half past two",
 *  "quarter to twelve", "noon", "midnight"). Returns null if unparseable. */
function parseTimeToHHMM(input: string): string | null {
  const raw = (input || "").trim().toLowerCase().replace(/\./g, "");
  if (!raw) return null;
  if (raw === "noon" || raw === "midday" || /中午/.test(raw)) return "12:00";
  if (raw === "midnight" || /午夜/.test(raw)) return "00:00";

  // Meridiem from English OR Chinese markers (上午/早上 = AM, 下午/晚上 = PM).
  const isPM = /\bpm\b|afternoon|evening|tonight|下午|晚上|傍晚/.test(raw);
  const isAM = /\bam\b|morning|上午|早上|早晨|凌晨/.test(raw);

  // Pull the first H:MM from anywhere in the string, so Chinese times like
  // "上午11点" or "11点半" parse as well as "11:00 am" / "11am" / "11".
  const m = raw.match(/(\d{1,2})(?::(\d{2}))?/);
  if (m) {
    let h = parseInt(m[1], 10);
    let min = m[2] ? parseInt(m[2], 10) : 0;
    if (!m[2] && /半/.test(raw)) min = 30; // "11点半" = 11:30
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    return h > 23 || min > 59 ? null : `${pad2(h)}:${pad2(min)}`;
  }

  // Spoken form: find the hour word, then minutes/meridiem modifiers.
  const hourWord = Object.keys(WORD_HOURS).find((w) => new RegExp(`\\b${w}\\b`).test(raw));
  if (!hourWord) return null;
  let h = WORD_HOURS[hourWord];

  let min = 0;
  if (/\b(thirty|half)\b/.test(raw)) min = 30;
  else if (/\bforty[\s-]?five\b/.test(raw)) min = 45;
  else if (/\b(fifteen|quarter)\b/.test(raw)) min = 15;

  if (min > 0 && /\bto\b/.test(raw)) { min = 60 - min; h = h === 1 ? 12 : h - 1; } // "quarter to twelve"

  if (isPM && h < 12) h += 12;
  else if (isAM && h === 12) h = 0;

  return h > 23 || min > 59 ? null : `${pad2(h)}:${pad2(min)}`;
}

/**
 * Resolve the appointment start instant (epoch ms) from whatever the agent sent.
 * Prefers an explicit ISO `startISO`; otherwise reconstructs from `dateStr` +
 * `timeStr` in the org timezone. The Retell function template sends date/time
 * (not a single ISO `start`), so this keeps booking working either way.
 */
export function resolveStartMs(
  startISO: string | undefined,
  dateStr: string | undefined,
  timeStr: string | undefined,
  timezone: string
): number | null {
  if (startISO) {
    const ms = new Date(startISO).getTime();
    if (!Number.isNaN(ms)) return ms; // already a clean ISO timestamp
  }
  const todayISO = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  // Fall back to the start string for the date/time if those args are absent.
  const date = normalizeDateStr(dateStr || startISO || "", todayISO);
  const hhmm = parseTimeToHHMM(timeStr || startISO || "");
  if (!hhmm) return null;
  return zonedToUtc(date, hhmm, timezone).getTime();
}
