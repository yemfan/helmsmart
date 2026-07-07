import "server-only";

import { supabaseServer } from "@/lib/supabaseServer";
import type { GeoLevel } from "./types";

/**
 * Read helpers for the Data Center market warehouse (Phase B). These are the
 * clean entry points Phase C's metro/state data pages will consume. All reads go
 * through the service-role client (the tables are RLS-deny with no policies).
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
 * Phase C coverage (which state/metro pages exist).
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
