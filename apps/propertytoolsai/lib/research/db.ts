import "server-only";

import { supabaseServer } from "@/lib/supabaseServer";
import type { ResearchReport, ResearchReportRow } from "./types";

/**
 * Data-access layer for `research_reports`. All access is via the service-role
 * client (RLS is on with no policies), never a session-scoped client.
 */

/** Upsert a generated report by slug. Returns { ok, error }. */
export async function upsertResearchReport(
  report: ResearchReport,
  slug: string,
  publishedDate: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabaseServer.from("research_reports").upsert(
    {
      kind: report.kind,
      slug,
      title: report.title,
      dek: report.dek,
      period_label: report.periodLabel,
      key_stats: report.keyStats,
      data_table: report.dataTable,
      sources: report.sources,
      analysis_consumer: report.analysisConsumer,
      analysis_agent: report.analysisAgent,
      published_date: publishedDate,
      status: "published",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "slug" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

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
