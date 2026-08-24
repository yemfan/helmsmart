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
