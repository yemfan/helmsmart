import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

import { SUPPORTED_LOCALES, type SupportedLocale } from "./config";

/** The minimum of a Supabase client these lookups need. Lets a caller pass a
 *  client for a specific project rather than the host-resolved default. */
type Db = Awaited<ReturnType<typeof createServiceClient>>;

/**
 * The language a person reads, for code that has no request behind it.
 *
 * `getServerLocale()` answers this from the cookie, which is the right answer
 * whenever there IS a request. Crons have no cookie: the weekly digest, the
 * insights cron, anything generated ahead of time. Those default to English
 * unless they ask here first.
 *
 * Reads `user_preferences.ui_locale`, written by `/api/me/ui-locale` whenever
 * the person picks a language. Returns null rather than "en" so a caller can
 * tell "they chose English" from "we don't know" — both render English today,
 * but only one is a fact about the person.
 *
 * PASS `db` WHEN YOU ALREADY HAVE ONE. Without it this resolves the service
 * client from the request host, and a cron has no host, so it always lands on
 * Core. A caller looping over `packServiceConns()` is by definition iterating
 * projects, and would otherwise look every recipient up in the wrong one —
 * finding nothing and silently falling back to English. Only Core is live
 * today (the medical vertical is archived), so this is insurance, not a
 * live bug; it costs one parameter to not have to remember later.
 */
export async function userUiLocale(
  userId: string,
  db?: Db,
): Promise<SupportedLocale | null> {
  const supabase = db ?? (await createServiceClient());
  const { data } = await supabase
    .from("user_preferences")
    .select("ui_locale")
    .eq("user_id", userId)
    .maybeSingle();
  return coerce((data as { ui_locale?: string | null } | null)?.ui_locale);
}

/**
 * One round trip for a batch — a digest addressed to every owner and admin
 * of an organization needs each recipient's language, not one query each.
 *
 * Every id asked for comes back in the map, so a caller can group recipients
 * by locale without checking for absence: no row means null, which means
 * English.
 */
export async function userUiLocales(
  userIds: string[],
  db?: Db,
): Promise<Map<string, SupportedLocale | null>> {
  const out = new Map<string, SupportedLocale | null>(userIds.map((id) => [id, null]));
  if (userIds.length === 0) return out;
  const supabase = db ?? (await createServiceClient());
  const { data } = await supabase
    .from("user_preferences")
    .select("user_id, ui_locale")
    .in("user_id", userIds);
  for (const row of (data ?? []) as { user_id: string; ui_locale: string | null }[]) {
    out.set(row.user_id, coerce(row.ui_locale));
  }
  return out;
}

/** Narrow an arbitrary DB string to a locale this app actually ships. */
function coerce(value: unknown): SupportedLocale | null {
  const v = typeof value === "string" ? value.trim() : "";
  return (SUPPORTED_LOCALES as readonly string[]).includes(v) ? (v as SupportedLocale) : null;
}
