import "server-only";

import type { ConnectorResult, MetricRow } from "./types";

/**
 * FRED connector for the market warehouse.
 *
 * Ingests national rate + housing series from FRED (Federal Reserve Economic
 * Data, St. Louis Fed) into normalized national ('US') metric rows. Reuses the
 * FRED_API_KEY already used by lib/research/fred.ts (verified 2026-07-06: all
 * series below return data).
 *
 * Verified series shapes: /fred/series/observations returns
 *   { observations: [{ date: "YYYY-MM-DD", value: "<num|.>" }, ...] }
 * newest-first with sort_order=desc. Missing values are ".".
 */

const SOURCE = "FRED / St. Louis Fed";

type FredMetricSpec = {
  seriesId: string;
  metric: string;
  unit: string; // 'percent' | 'usd' | 'count'
};

/**
 * National series to ingest. Verified 2026-07-06 against the live FRED API:
 *  - MORTGAGE30US / MORTGAGE15US: Freddie Mac weekly fixed-rate averages (%)
 *  - DGS10: 10-yr Treasury constant maturity (%)
 *  - MSPUS: median sales price of houses sold (USD, quarterly)
 *  - MSACSR: monthly supply of new houses (months)
 *  - HOSINVUSM495N: new houses for sale, total (count of houses)
 */
const FRED_SPECS: FredMetricSpec[] = [
  { seriesId: "MORTGAGE30US", metric: "mortgage_30yr", unit: "percent" },
  { seriesId: "MORTGAGE15US", metric: "mortgage_15yr", unit: "percent" },
  { seriesId: "DGS10", metric: "treasury_10yr", unit: "percent" },
  { seriesId: "MSPUS", metric: "median_sale_price", unit: "usd" },
  { seriesId: "MSACSR", metric: "months_supply", unit: "count" },
  { seriesId: "HOSINVUSM495N", metric: "new_home_inventory", unit: "count" },
];

type RawObs = { date?: unknown; value?: unknown };

async function fetchSeriesRows(
  spec: FredMetricSpec,
  apiKey: string,
  months: number,
): Promise<MetricRow[]> {
  const url =
    `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${encodeURIComponent(spec.seriesId)}` +
    `&api_key=${encodeURIComponent(apiKey)}` +
    `&file_type=json&sort_order=desc&limit=${months}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${spec.seriesId} → ${res.status}`);
  const json: unknown = await res.json();
  const rawObs = (json as { observations?: unknown }).observations;
  if (!Array.isArray(rawObs)) throw new Error(`${spec.seriesId}: no observations`);

  const rows: MetricRow[] = [];
  for (const o of rawObs as RawObs[]) {
    const date = typeof o.date === "string" ? o.date : null;
    const valStr = typeof o.value === "string" ? o.value : null;
    if (!date) continue;
    if (!valStr || valStr === ".") continue;
    const value = Number(valStr);
    if (!Number.isFinite(value)) continue;
    rows.push({
      geo_level: "national",
      geo_code: "US",
      metric: spec.metric,
      period: date,
      value,
      unit: spec.unit,
      source: SOURCE,
    });
  }
  return rows;
}

/**
 * Ingest all national FRED series. Best-effort per series: one failing series is
 * recorded in the error string but the others still return. `months` is the
 * trailing observation count requested per series (13 by default — for weekly
 * series that's ~3 months, for monthly ~13 months, which is what we want).
 */
export async function ingestFred(months = 13): Promise<ConnectorResult> {
  const apiKey = process.env.FRED_API_KEY?.trim();
  if (!apiKey) {
    return { source: SOURCE, metrics: [], geographies: [], error: "FRED_API_KEY not set" };
  }

  const metrics: MetricRow[] = [];
  const errors: string[] = [];

  const settled = await Promise.allSettled(
    FRED_SPECS.map((spec) => fetchSeriesRows(spec, apiKey, months)),
  );
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      metrics.push(...r.value);
    } else {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      errors.push(`${FRED_SPECS[i].seriesId}: ${msg}`);
    }
  });

  // National geography row so the dimension always has 'US'.
  const geographies = [
    {
      geo_level: "national" as const,
      geo_code: "US",
      geo_name: "United States",
      state: null,
      size_rank: 0,
    },
  ];

  return {
    source: SOURCE,
    metrics,
    geographies,
    error: errors.length ? errors.join("; ") : undefined,
  };
}
