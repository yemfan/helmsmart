import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * One timezone per account.
 *
 * There used to be two, with different defaults, and they disagreed by three
 * hours out of the box:
 *
 *   agents.briefing_timezone                → America/Los_Angeles
 *   voice_receptionist_settings.timezone    → America/New_York
 *
 * Briefings fired on one, and the receptionist booked appointments on the
 * other. An agent who never opened the receptionist panel — which is most of
 * them, since the field was buried in it — had their AI booking 9am
 * appointments that landed at noon for the caller. A wrong briefing time is an
 * annoyance; a wrong appointment time is a missed showing.
 *
 * `agents.briefing_timezone` is the survivor because it already backed
 * briefings, the overnight run and the dashboard, so it has real values in it
 * for agents who set one. The receptionist column is no longer read — see
 * lib/voice-receptionist/settings.ts.
 */

/**
 * The default when an agent has never chosen. Matches what briefings, the
 * overnight run and the daily-briefing cron already used, so adopting it
 * changes nothing for anyone who was relying on the old behaviour there.
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
 * The account's timezone. Never throws: a lookup failure returns the default,
 * because a receptionist that refuses to answer is worse than one answering on
 * a best-guess clock.
 */
export async function getAccountTimezone(agentId: string | number | null | undefined): Promise<string> {
  if (agentId === null || agentId === undefined || agentId === "") return DEFAULT_ACCOUNT_TIMEZONE;
  try {
    const { data } = await supabaseAdmin
      .from("agents")
      .select("briefing_timezone")
      .eq("id", agentId as never)
      .maybeSingle();
    return safeAccountTimezone((data as { briefing_timezone?: string | null } | null)?.briefing_timezone);
  } catch {
    return DEFAULT_ACCOUNT_TIMEZONE;
  }
}
