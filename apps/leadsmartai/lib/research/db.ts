import "server-only";

import { supabaseServer } from "@/lib/supabaseServer";
import type { ResearchReportRow } from "./types";

/**
 * Read-only data-access layer for the SHARED `research_reports` table. RealtyBoss
 * renders the AGENT framing over rows written by the apps/propertytoolsai
 * generator. All access is via the service-role client (`supabaseServer`) because
 * `research_reports` has RLS on with no policies — a session-scoped client would
 * read nothing. Never write here; the generator + migration live in propertytoolsai.
 */

/** Fetch a single published report by slug. */
export async function getResearchReport(slug: string): Promise<ResearchReportRow | null> {
  const { data, error } = await supabaseServer
    .from("research_reports")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) {
    console.warn("[research] getResearchReport:", error.message);
    return null;
  }
  return (data as ResearchReportRow | null) ?? null;
}

/** List published reports, newest-first. */
export async function listResearchReports(limit = 100): Promise<ResearchReportRow[]> {
  const { data, error } = await supabaseServer
    .from("research_reports")
    .select("*")
    .eq("status", "published")
    .order("published_date", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[research] listResearchReports:", error.message);
    return [];
  }
  return (data as ResearchReportRow[] | null) ?? [];
}

/** Lightweight rows for the sitemap (slug + updated_at only). */
export async function listResearchReportsForSitemap(): Promise<
  { slug: string; updatedAt: string | null }[]
> {
  const { data, error } = await supabaseServer
    .from("research_reports")
    .select("slug, updated_at")
    .eq("status", "published")
    .order("published_date", { ascending: false })
    .limit(1000);
  if (error) {
    console.warn("[research] listResearchReportsForSitemap:", error.message);
    return [];
  }
  return ((data as { slug: string; updated_at: string | null }[] | null) ?? []).map((r) => ({
    slug: r.slug,
    updatedAt: r.updated_at,
  }));
}
