/**
 * Read-only aggregation helpers for the /admin/seo dashboard.
 * All reads go through the service-role client (RLS-exempt).
 */

import { supabaseServer } from "@/lib/supabaseServer";

const WINDOW_DAYS = 28;
const MAX_ROWS = 50000;

function windowStartIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - WINDOW_DAYS);
  return d.toISOString().slice(0, 10);
}

type PageMetricRow = {
  site: string;
  page: string;
  clicks: number | null;
  impressions: number | null;
  position: number | null;
};

type QueryMetricRow = {
  query: string;
  clicks: number | null;
  impressions: number | null;
  position: number | null;
};

export type SiteSummary = {
  site: string;
  indexedPages: number; // distinct pages with impressions > 0
  clicks: number;
  impressions: number;
  avgPosition: number | null;
};

export type PageAgg = {
  page: string;
  clicks: number;
  impressions: number;
  avgPosition: number | null;
};

export type QueryAgg = {
  query: string;
  clicks: number;
  impressions: number;
  avgPosition: number | null;
};

export type ClusterCoverage = {
  generatedClusterPages: number;
  clusterPagesWithImpressions: number;
};

export type SeoReport = {
  windowDays: number;
  hasData: boolean;
  siteSummaries: SiteSummary[];
  topPages: PageAgg[];
  topQueries: QueryAgg[];
  clusterCoverage: ClusterCoverage;
};

/** Impression-weighted average position (GSC's own convention). */
function weightedAvgPosition(
  items: { impressions: number; position: number | null }[]
): number | null {
  let num = 0;
  let den = 0;
  for (const it of items) {
    if (it.position == null) continue;
    const w = it.impressions > 0 ? it.impressions : 1;
    num += it.position * w;
    den += w;
  }
  return den > 0 ? num / den : null;
}

export async function getSeoReport(): Promise<SeoReport> {
  const since = windowStartIso();

  const { data: pageData } = await supabaseServer
    .from("gsc_page_metrics")
    .select("site, page, clicks, impressions, position")
    .gte("date", since)
    .limit(MAX_ROWS);

  const { data: queryData } = await supabaseServer
    .from("gsc_query_metrics")
    .select("query, clicks, impressions, position")
    .gte("date", since)
    .limit(MAX_ROWS);

  const pageRows = (pageData ?? []) as PageMetricRow[];
  const queryRows = (queryData ?? []) as QueryMetricRow[];

  // --- Per-site summary + distinct impressed pages ---
  const bySite = new Map<
    string,
    {
      clicks: number;
      impressions: number;
      pos: { impressions: number; position: number | null }[];
      impressedPages: Set<string>;
    }
  >();

  for (const r of pageRows) {
    const clicks = r.clicks ?? 0;
    const impressions = r.impressions ?? 0;
    let s = bySite.get(r.site);
    if (!s) {
      s = { clicks: 0, impressions: 0, pos: [], impressedPages: new Set() };
      bySite.set(r.site, s);
    }
    s.clicks += clicks;
    s.impressions += impressions;
    s.pos.push({ impressions, position: r.position });
    if (impressions > 0) s.impressedPages.add(r.page);
  }

  const siteSummaries: SiteSummary[] = Array.from(bySite.entries())
    .map(([site, s]) => ({
      site,
      indexedPages: s.impressedPages.size,
      clicks: s.clicks,
      impressions: s.impressions,
      avgPosition: weightedAvgPosition(s.pos),
    }))
    .sort((a, b) => b.impressions - a.impressions);

  // --- Top pages by impressions (aggregated across sites, over the window) ---
  const pageAgg = new Map<
    string,
    { clicks: number; impressions: number; pos: { impressions: number; position: number | null }[] }
  >();
  for (const r of pageRows) {
    let p = pageAgg.get(r.page);
    if (!p) {
      p = { clicks: 0, impressions: 0, pos: [] };
      pageAgg.set(r.page, p);
    }
    p.clicks += r.clicks ?? 0;
    p.impressions += r.impressions ?? 0;
    p.pos.push({ impressions: r.impressions ?? 0, position: r.position });
  }
  const topPages: PageAgg[] = Array.from(pageAgg.entries())
    .map(([page, p]) => ({
      page,
      clicks: p.clicks,
      impressions: p.impressions,
      avgPosition: weightedAvgPosition(p.pos),
    }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 25);

  // --- Top queries by impressions ---
  const queryAgg = new Map<
    string,
    { clicks: number; impressions: number; pos: { impressions: number; position: number | null }[] }
  >();
  for (const r of queryRows) {
    let q = queryAgg.get(r.query);
    if (!q) {
      q = { clicks: 0, impressions: 0, pos: [] };
      queryAgg.set(r.query, q);
    }
    q.clicks += r.clicks ?? 0;
    q.impressions += r.impressions ?? 0;
    q.pos.push({ impressions: r.impressions ?? 0, position: r.position });
  }
  const topQueries: QueryAgg[] = Array.from(queryAgg.entries())
    .map(([query, q]) => ({
      query,
      clicks: q.clicks,
      impressions: q.impressions,
      avgPosition: weightedAvgPosition(q.pos),
    }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 25);

  // --- Cluster coverage: generated /guides/ pages vs those with impressions ---
  const clusterCoverage = await getClusterCoverage(pageRows);

  const hasData = pageRows.length > 0 || queryRows.length > 0;

  return {
    windowDays: WINDOW_DAYS,
    hasData,
    siteSummaries,
    topPages,
    topQueries,
    clusterCoverage,
  };
}

/**
 * Cluster pages live at /guides/{topic}/{location} (buildGuidePath). We count:
 *  - generated: total rows in seo_cluster_pages (the universe we published)
 *  - withImpressions: distinct GSC page paths that start with /guides/ and had
 *    impressions > 0 in the window. GSC "page" values are full URLs, so we
 *    match on the path via a substring ("/guides/") to stay host-agnostic.
 */
async function getClusterCoverage(pageRows: PageMetricRow[]): Promise<ClusterCoverage> {
  let generatedClusterPages = 0;
  const { count } = await supabaseServer
    .from("seo_cluster_pages")
    .select("id", { count: "exact", head: true });
  if (typeof count === "number") generatedClusterPages = count;

  const withImpressions = new Set<string>();
  for (const r of pageRows) {
    if ((r.impressions ?? 0) <= 0) continue;
    const idx = r.page.indexOf("/guides/");
    if (idx === -1) continue;
    // Normalize to the path portion so the same guide across hosts counts once.
    withImpressions.add(r.page.slice(idx));
  }

  return {
    generatedClusterPages,
    clusterPagesWithImpressions: withImpressions.size,
  };
}
