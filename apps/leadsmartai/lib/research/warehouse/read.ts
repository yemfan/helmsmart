import "server-only";

import { supabaseServer } from "@/lib/supabaseServer";
import type { GeoLevel } from "./types";
import { geoSlug, stateSlug } from "./slug";

/**
 * Read helpers for the Data Center market warehouse. These are the clean entry
 * points CloseBoss's metro/state data pages consume. All reads go through the
 * service-role client (`@/lib/supabaseServer`) because the shared warehouse
 * tables are RLS-deny with no policies — a session client would read nothing.
 * The tables are populated by the apps/propertytoolsai pipeline; read-only here.
 */

export type LatestMetric = {
  metric: string;
  value: number | null;
  unit: string | null;
  period: string; // YYYY-MM-DD
  source: string | null;
};

export type SeriesPoint = {
  period: string; // YYYY-MM-DD
  value: number | null;
};

export type ActiveGeography = {
  geo_level: GeoLevel;
  geo_code: string;
  geo_name: string;
  state: string | null;
  size_rank: number | null;
};

/**
 * Latest observation per metric for one geography. Returns one entry per metric,
 * newest period wins. Empty array when the geography has no data.
 */
export async function getLatestMetrics(
  geoLevel: GeoLevel,
  geoCode: string,
): Promise<LatestMetric[]> {
  const { data, error } = await supabaseServer
    .from("market_metrics")
    .select("metric, value, unit, period, source")
    .eq("geo_level", geoLevel)
    .eq("geo_code", geoCode)
    .order("period", { ascending: false });

  if (error || !data) return [];

  const seen = new Map<string, LatestMetric>();
  for (const row of data as LatestMetric[]) {
    if (!seen.has(row.metric)) seen.set(row.metric, row);
  }
  return Array.from(seen.values());
}

/**
 * Trailing series for a single metric, oldest→newest, capped to `months` points.
 * Suitable for charting.
 */
export async function getMetricSeries(
  geoLevel: GeoLevel,
  geoCode: string,
  metric: string,
  months = 13,
): Promise<SeriesPoint[]> {
  const { data, error } = await supabaseServer
    .from("market_metrics")
    .select("period, value")
    .eq("geo_level", geoLevel)
    .eq("geo_code", geoCode)
    .eq("metric", metric)
    .order("period", { ascending: false })
    .limit(months);

  if (error || !data) return [];

  return (data as SeriesPoint[])
    .slice()
    .reverse()
    .map((r) => ({ period: r.period, value: r.value }));
}

/**
 * List active geographies for a level, ordered by size (largest first). Drives
 * coverage (which state/metro pages exist).
 */
export async function listActiveGeographies(
  geoLevel: GeoLevel,
): Promise<ActiveGeography[]> {
  const { data, error } = await supabaseServer
    .from("market_geographies")
    .select("geo_level, geo_code, geo_name, state, size_rank")
    .eq("geo_level", geoLevel)
    .eq("active", true)
    .order("size_rank", { ascending: true, nullsFirst: false });

  if (error || !data) return [];
  return data as ActiveGeography[];
}

/**
 * Active metros within a state (by 2-letter code), largest-first by size_rank.
 * Drives the "metros in <state>" table + internal links on the state page.
 */
export async function listMetrosForState(
  stateCode: string,
): Promise<ActiveGeography[]> {
  const { data, error } = await supabaseServer
    .from("market_geographies")
    .select("geo_level, geo_code, geo_name, state, size_rank")
    .eq("geo_level", "metro")
    .eq("active", true)
    .eq("state", stateCode.toUpperCase())
    .order("size_rank", { ascending: true, nullsFirst: false });

  if (error || !data) return [];
  return data as ActiveGeography[];
}

/**
 * Resolve a URL slug back to its active geography for a level, or null.
 *
 * Metro geo_code is an opaque Zillow RegionID, so we can't query by slug
 * directly — we list the level's active geographies (~50 states / ~300 metros)
 * and match on the computed slug.
 */
async function activeGeographiesCached(
  geoLevel: GeoLevel,
): Promise<ActiveGeography[]> {
  return listActiveGeographies(geoLevel);
}

export async function getGeographyBySlug(
  geoLevel: GeoLevel,
  slug: string,
): Promise<ActiveGeography | null> {
  const target = slug.trim().toLowerCase();
  if (!target) return null;
  const geos = await activeGeographiesCached(geoLevel);
  return geos.find((g) => geoSlug(g) === target) ?? null;
}

/**
 * Sitemap entries for the Data Center market pages: the markets hub, every
 * active state page, and every active metro page. `lastmod` is the newest metric
 * period for that geography. Never throws — returns [] on any failure so the
 * sitemap can't crash.
 */
export async function listMarketSitemapEntries(): Promise<
  { path: string; lastmod: string | null }[]
> {
  try {
    const [states, metros] = await Promise.all([
      listActiveGeographies("state"),
      listActiveGeographies("metro"),
    ]);

    // Newest period per (geo_level, geo_code) — one pass over recent rows.
    const latestByKey = new Map<string, string>();
    const { data } = await supabaseServer
      .from("market_metrics")
      .select("geo_level, geo_code, period")
      .in("geo_level", ["national", "state", "metro"])
      .order("period", { ascending: false })
      .limit(50000);
    for (const row of (data as
      | { geo_level: string; geo_code: string; period: string }[]
      | null) ?? []) {
      const key = `${row.geo_level}:${row.geo_code}`;
      if (!latestByKey.has(key)) latestByKey.set(key, row.period);
    }

    const entries: { path: string; lastmod: string | null }[] = [
      { path: "/data/markets", lastmod: latestByKey.get("national:US") ?? null },
    ];

    for (const s of states) {
      const slug = geoSlug(s);
      if (!slug) continue;
      entries.push({
        path: `/data/markets/${slug}`,
        lastmod: latestByKey.get(`state:${s.geo_code}`) ?? null,
      });
    }

    for (const m of metros) {
      const metroSlug = geoSlug(m);
      const st = m.state ? stateSlug(m.state) : "";
      if (!metroSlug || !st) continue;
      entries.push({
        path: `/data/markets/${st}/${metroSlug}`,
        lastmod: latestByKey.get(`metro:${m.geo_code}`) ?? null,
      });
    }

    return entries;
  } catch {
    return [];
  }
}
