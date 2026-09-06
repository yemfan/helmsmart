import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { DEFAULT_ACCOUNT_TIMEZONE, isValidTimezone, safeAccountTimezone } from "./timezone";

/**
 * Reading the one timezone an account has.
 *
 * The rules themselves (the default, what counts as valid) live in
 * ./timezone.ts, which is pure — the settings panel is a Client Component and
 * needs them too, and this module cannot cross that line because it talks to
 * the database.
 *
 * `agents.timezone` is the single source. It was `briefing_timezone` — the real
 * value, but named after the one feature that happened to add the column, which
 * is why two other places grew their own answer. The receptionist's column is
 * gone and every caller now comes through here.
 *
 * briefing_timezone is still read as a fallback and still written by the
 * settings API, because a deployment is not atomic: until the last bundle that
 * reads the old column is retired, both have to be true.
 */

export { DEFAULT_ACCOUNT_TIMEZONE, isValidTimezone, safeAccountTimezone } from "./timezone";

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
      .select("timezone, briefing_timezone")
      .eq("id", agentId as never)
      .maybeSingle();
    const row = data as { timezone?: string | null; briefing_timezone?: string | null } | null;
    // New column first, old one while it still exists. isValidTimezone gates
    // the choice so a blank or junk `timezone` falls through to
    // briefing_timezone, rather than resolving to the default and quietly
    // ignoring a value the account really has.
    return isValidTimezone(row?.timezone)
      ? safeAccountTimezone(row?.timezone)
      : safeAccountTimezone(row?.briefing_timezone);
  } catch {
    return DEFAULT_ACCOUNT_TIMEZONE;
  }
}
