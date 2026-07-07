/**
 * Shared types for the Data Center market-metrics warehouse (Phase B).
 *
 * The warehouse (`market_geographies` + `market_metrics`) is populated by the
 * apps/propertytoolsai ingestion pipeline in the SHARED Supabase project.
 * RealtyBoss reads it read-only and renders the AGENT framing.
 */

export type GeoLevel = "national" | "state" | "metro";

/** A single geography dimension row (national / state / metro). */
export type GeoRow = {
  geo_level: GeoLevel;
  geo_code: string; // 'US' | 2-letter state | Zillow RegionID
  geo_name: string;
  state: string | null; // 2-letter state code for metros
  size_rank: number | null; // Zillow SizeRank (0 = national)
};

/** A single long-format metric observation. */
export type MetricRow = {
  geo_level: GeoLevel;
  geo_code: string;
  metric: string; // e.g. 'zhvi', 'median_sale_price', 'mortgage_30yr'
  period: string; // YYYY-MM-DD (month boundary)
  value: number | null;
  unit: string; // 'usd' | 'count' | 'days' | 'percent' | 'index'
  source: string; // provenance label
};
