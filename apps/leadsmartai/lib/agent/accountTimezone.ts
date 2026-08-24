import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { DEFAULT_ACCOUNT_TIMEZONE, safeAccountTimezone } from "./timezone";

/**
 * Reading the one timezone an account has.
 *
 * The rules themselves (the default, what counts as valid) live in
 * ./timezone.ts, which is pure — the settings panel is a Client Component and
 * needs them too, and this module cannot cross that line because it talks to
 * the database.
 *
 * `agents.briefing_timezone` is the single source. It already backed briefings,
 * the overnight run and the dashboard, so it holds real values for agents who
 * set one; the receptionist's own column is no longer read.
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
      .select("briefing_timezone")
      .eq("id", agentId as never)
      .maybeSingle();
    return safeAccountTimezone((data as { briefing_timezone?: string | null } | null)?.briefing_timezone);
  } catch {
    return DEFAULT_ACCOUNT_TIMEZONE;
  }
}
