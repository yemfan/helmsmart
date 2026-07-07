import "server-only";

import { supabaseServer } from "@/lib/supabaseServer";
import type { DigestItem, DigestSource } from "./generateDigest";

/**
 * Service-role reads for the Weekly Regional Newsletter digest store. The
 * newsletter_digests table is RLS-deny with no policies, so reads MUST go through
 * @/lib/supabaseServer (service role) — a session client reads nothing.
 */

export type NewsletterDigestRow = {
  id: string;
  week_of: string; // YYYY-MM-DD (Monday)
  title: string;
  intro: string | null;
  items: DigestItem[];
  sources: DigestSource[] | null;
  status: string;
  created_at: string;
};

function hasServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

/** Newest published digest, or null. */
export async function getLatestDigest(): Promise<NewsletterDigestRow | null> {
  if (!hasServiceRole()) return null;
  const { data, error } = await supabaseServer
    .from("newsletter_digests")
    .select("id, week_of, title, intro, items, sources, status, created_at")
    .eq("status", "published")
    .order("week_of", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as NewsletterDigestRow;
}

/** The published digest for a specific week (YYYY-MM-DD Monday), or null. */
export async function getDigestForWeek(
  weekOf: string,
): Promise<NewsletterDigestRow | null> {
  if (!hasServiceRole()) return null;
  const { data, error } = await supabaseServer
    .from("newsletter_digests")
    .select("id, week_of, title, intro, items, sources, status, created_at")
    .eq("status", "published")
    .eq("week_of", weekOf)
    .maybeSingle();
  if (error || !data) return null;
  return data as NewsletterDigestRow;
}

/** The N most recent published digests, newest first. */
export async function listRecentDigests(
  n = 12,
): Promise<NewsletterDigestRow[]> {
  if (!hasServiceRole()) return [];
  const { data, error } = await supabaseServer
    .from("newsletter_digests")
    .select("id, week_of, title, intro, items, sources, status, created_at")
    .eq("status", "published")
    .order("week_of", { ascending: false })
    .limit(Math.max(1, Math.min(200, n)));
  if (error || !data) return [];
  return data as NewsletterDigestRow[];
}
