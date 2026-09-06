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
 * `agents.timezone` is the single source. It was `briefing_timezone` — the real
 * value, but named after the one feature that happened to add the column, which
 * is why two other places grew their own answer. The receptionist's column is
 * gone, the briefing one is backfilled and no longer read, and every caller now
 * comes through here.
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
      .select("timezone")
      .eq("id", agentId as never)
      .maybeSingle();
    const row = data as { timezone?: string | null } | null;
    return safeAccountTimezone(row?.timezone);
  } catch {
    return DEFAULT_ACCOUNT_TIMEZONE;
  }
}
