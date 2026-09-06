/**
 * Timezone rules, pure.
 *
 * Deliberately its own module with NO `server-only` import. The receptionist
 * settings panel is a Client Component and needs the same default and the same
 * validity rule as the server; putting these next to the database lookup meant
 * importing them dragged `server-only` into the browser bundle and broke the
 * build — a boundary `tsc --noEmit` cannot see.
 *
 * Keep this file pure: no I/O, no env, no server imports. The lookup lives in
 * accountTimezone.ts.
 */

/**
 * The default when an agent has never chosen.
 *
 * There used to be two defaults, three hours apart:
 *
 *   agents.briefing_timezone             → America/Los_Angeles
 *   voice_receptionist_settings.timezone → America/New_York
 *
 * Briefings fired on one and the receptionist booked appointments on the other,
 * so an agent who never opened the receptionist panel had their AI booking 9am
 * appointments that landed at noon for the caller. Los_Angeles wins because
 * briefings, the overnight run and the daily-briefing cron already used it.
 */
export const DEFAULT_ACCOUNT_TIMEZONE = "America/Los_Angeles";

/**
 * True if the string is a zone this runtime can resolve AND is unambiguous.
 *
 * "Intl accepts it" is not a high enough bar. Node accepts legacy abbreviations
 * and resolves them in ways nobody expects — `EST` becomes America/Panama,
 * which does NOT observe daylight saving, so an agent who typed the obvious
 * three letters would have their AI booking an hour out for half the year.
 *
 * So: Region/City form, or UTC. Both are unambiguous; an abbreviation is not.
 */
export function isValidTimezone(tz: string | null | undefined): boolean {
  const v = tz?.trim();
  if (!v) return false;
  if (v !== "UTC" && !v.includes("/")) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v });
    return true;
  } catch {
    return false;
  }
}

/** A usable zone, falling back rather than throwing on junk. */
export function safeAccountTimezone(tz: string | null | undefined): string {
  return isValidTimezone(tz) ? (tz as string).trim() : DEFAULT_ACCOUNT_TIMEZONE;
}

/**
 * The zones offered in the picker, plus the sentinel for "type your own".
 *
 * Lives here rather than in a component because two screens now offer it — the
 * account setting in General settings and, historically, the briefing card —
 * and a list that exists twice is a list that will disagree with itself. This
 * module is deliberately pure, so a Client Component can import it.
 */
export const COMMON_TIMEZONES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Phoenix", label: "Arizona (no DST)" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "America/Toronto", label: "Toronto" },
  { value: "America/Vancouver", label: "Vancouver" },
  { value: "America/Mexico_City", label: "Mexico City" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Australia/Sydney", label: "Sydney" },
];

export const COMMON_TIMEZONE_VALUES = new Set(COMMON_TIMEZONES.map((t) => t.value));

/** Sentinel for the "Other…" option, so a real zone can never collide with it. */
export const OTHER_TIMEZONE = "__other__";
