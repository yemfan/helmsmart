import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

import { SUPPORTED_LOCALES, type SupportedLocale } from "./config";

/**
 * The language an agent reads, for code that has no request behind it.
 *
 * `getServerLocale()` answers this from the cookie, which is the right answer
 * whenever there IS a request. Crons and queue workers have no cookie: the
 * overnight Boss run, the 5-minute instruction cron, the weekly digests. Those
 * used to default to English, which is how a Chinese-speaking agent's
 * dashboard filled up with English task cards written by their own AI team —
 * the systemic half of the "Chinese dashboard is half English" report.
 *
 * Resolution order:
 *   1. `user_profiles.ui_language` — written whenever the agent picks a
 *      language (see `app/api/dashboard/ui-language/route.ts`).
 *   2. the locale of their most recent Boss run — evidence of what they last
 *      read, and the only signal available for agents who picked their
 *      language before (1) started being written.
 *   3. `null`, meaning "no evidence" — callers treat that as English, which is
 *      what `languageDirective` already does with a null locale.
 *
 * Returns null rather than "en" so a caller can tell "they chose English" from
 * "we don't know", which matters if we ever want to ask.
 */
export async function agentUiLocale(
  agentId: string,
): Promise<SupportedLocale | null> {
  const fromProfile = await localeFromProfile(agentId);
  if (fromProfile) return fromProfile;
  return localeFromLastBossRun(agentId);
}

/** Narrow an arbitrary DB string to a locale we actually ship. */
function coerce(value: unknown): SupportedLocale | null {
  const v = typeof value === "string" ? value.trim() : "";
  return (SUPPORTED_LOCALES as readonly string[]).includes(v)
    ? (v as SupportedLocale)
    : null;
}

async function localeFromProfile(agentId: string): Promise<SupportedLocale | null> {
  /*
   * `auth_user_id`, NOT `user_id`. On this schema `agents.user_id` is a
   * bigint left over from before Supabase Auth; the auth UUID that joins to
   * `user_profiles.user_id` lives in `auth_user_id`. Reading `user_id` here
   * would compare a bigint to a uuid and the join would simply never match,
   * which fails as "this agent has no language preference" — silently, and
   * forever.
   */
  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("auth_user_id")
    .eq("id", agentId)
    .maybeSingle();
  const authUserId = (agent as { auth_user_id?: string | null } | null)?.auth_user_id;
  if (!authUserId) return null;

  const { data } = await supabaseAdmin
    .from("user_profiles")
    .select("ui_language")
    .eq("user_id", authUserId)
    .maybeSingle();
  return coerce((data as { ui_language?: string | null } | null)?.ui_language);
}

async function localeFromLastBossRun(
  agentId: string,
): Promise<SupportedLocale | null> {
  const { data } = await supabaseAdmin
    .from("boss_runs")
    .select("locale")
    // `started_at`, not `created_at` — boss_runs has no created_at column.
    .eq("agent_id", agentId)
    .not("locale", "is", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return coerce((data as { locale?: string | null } | null)?.locale);
}
