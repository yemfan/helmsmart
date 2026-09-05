import "server-only";

import { DEFAULT_LOCALE, resolveLocale } from "@leadsmart/i18n";

import { supabaseServer } from "@/lib/supabaseServer";
import type { DigestItem, DigestSource } from "./generateDigest";

/**
 * Service-role reads for the Weekly Regional Newsletter digest store. The
 * newsletter_digests table is RLS-deny with no policies, so reads MUST go through
 * @/lib/supabaseServer (service role) — a session client reads nothing.
 *
 * Every read is scoped to ONE language. The table holds one row per
 * (week_of, language) since 20260905120000, so an unscoped read of a single
 * week is now ambiguous — `.maybeSingle()` would error on the second variant
 * rather than pick one. Callers that have a reader pass that reader's locale;
 * callers that have no reader pass nothing and get English.
 */

export type NewsletterDigestRow = {
  id: string;
  week_of: string; // YYYY-MM-DD (Monday)
  language: string; // "en" | "zh-Hans"
  title: string;
  intro: string | null;
  items: DigestItem[];
  sources: DigestSource[] | null;
  status: string;
  created_at: string;
};

const COLUMNS =
  "id, week_of, language, title, intro, items, sources, status, created_at";

function hasServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

/** Narrow anything the caller has (a cookie, a contact's preference) to a stored variant. */
function lang(input?: string | null): string {
  return resolveLocale(input) ?? DEFAULT_LOCALE;
}

/** Newest published digest in `language`, or null. */
export async function getLatestDigest(
  language?: string | null,
): Promise<NewsletterDigestRow | null> {
  if (!hasServiceRole()) return null;
  const { data, error } = await supabaseServer
    .from("newsletter_digests")
    .select(COLUMNS)
    .eq("status", "published")
    .eq("language", lang(language))
    .order("week_of", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as NewsletterDigestRow;
}

/** The published digest for a specific week (YYYY-MM-DD Monday) in `language`, or null. */
export async function getDigestForWeek(
  weekOf: string,
  language?: string | null,
): Promise<NewsletterDigestRow | null> {
  if (!hasServiceRole()) return null;
  const { data, error } = await supabaseServer
    .from("newsletter_digests")
    .select(COLUMNS)
    .eq("status", "published")
    .eq("week_of", weekOf)
    .eq("language", lang(language))
    .maybeSingle();
  if (error || !data) return null;
  return data as NewsletterDigestRow;
}

/**
 * The digest a specific READER should get for `weekOf`: their language when it
 * exists, English when it does not.
 *
 * Generation is per-language and best-effort — a week can publish English and
 * fail Chinese, or a language can be added between two weeks. Falling back
 * means a subscriber whose variant is missing still receives the newsletter in
 * a language they may not prefer, rather than silently receiving nothing.
 */
export async function getDigestForReader(
  weekOf: string,
  language?: string | null,
): Promise<NewsletterDigestRow | null> {
  const wanted = lang(language);
  const own = await getDigestForWeek(weekOf, wanted);
  if (own) return own;
  if (wanted === DEFAULT_LOCALE) return null;
  return getDigestForWeek(weekOf, DEFAULT_LOCALE);
}

/** The N most recent published digests in `language`, newest first. */
export async function listRecentDigests(
  n = 12,
  language?: string | null,
): Promise<NewsletterDigestRow[]> {
  if (!hasServiceRole()) return [];
  const { data, error } = await supabaseServer
    .from("newsletter_digests")
    .select(COLUMNS)
    .eq("status", "published")
    .eq("language", lang(language))
    .order("week_of", { ascending: false })
    .limit(Math.max(1, Math.min(200, n)));
  if (error || !data) return [];
  return data as NewsletterDigestRow[];
}
