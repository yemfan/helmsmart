/**
 * Shared types for the Data Center market-metrics warehouse (Phase B).
 *
 * Connectors normalize authoritative public data into flat `MetricRow`s and
 * `GeoRow`s that the ingestion orchestrator upserts into `market_metrics` and
 * `market_geographies`.
 */

export type GeoLevel = "national" | "state" | "metro" | "county" | "zip";

/** A single geography dimension row (national / state / metro / county). */
export type GeoRow = {
  geo_level: GeoLevel;
  geo_code: string; // 'US' | 2-letter state | Zillow RegionID
  geo_name: string;
  state: string | null; // 2-letter state code for metros/counties
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

/** Per-connector result the orchestrator aggregates. */
export type ConnectorResult = {
  source: string;
  metrics: MetricRow[];
  geographies: GeoRow[];
  error?: string;
};
