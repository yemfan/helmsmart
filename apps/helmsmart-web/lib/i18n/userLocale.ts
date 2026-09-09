import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

import { SUPPORTED_LOCALES, type SupportedLocale } from "./config";

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
 */
export async function userUiLocale(userId: string): Promise<SupportedLocale | null> {
  const supabase = await createServiceClient();
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
 */
export async function userUiLocales(
  userIds: string[],
): Promise<Map<string, SupportedLocale | null>> {
  const out = new Map<string, SupportedLocale | null>(userIds.map((id) => [id, null]));
  if (userIds.length === 0) return out;
  const supabase = await createServiceClient();
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
