import "server-only";

import type { ConnectorResult, GeoLevel, GeoRow, MetricRow } from "./types";
import { fetchGunzippedText, parseNum, splitDelimitedLine, toLines } from "./parse";

/**
 * Redfin Data Center connector for the market warehouse.
 *
 * Verified 2026-07-06 against https://www.redfin.com/news/data-center/ — the
 * national (~0.5MB gz) and state (~9MB gz) market-tracker files return 200 from
 * redfin-public-data.s3.us-west-2.amazonaws.com. Tab-delimited, gzipped, with
 * every string field double-quoted.
 *
 * Observed header (national & state share it):
 *   PERIOD_BEGIN, PERIOD_END, PERIOD_DURATION, REGION_TYPE, REGION_TYPE_ID,
 *   TABLE_ID, IS_SEASONALLY_ADJUSTED, REGION, CITY, STATE, STATE_CODE,
 *   PROPERTY_TYPE, PROPERTY_TYPE_ID, MEDIAN_SALE_PRICE, ... HOMES_SOLD, ...
 *   INVENTORY, ..., MONTHS_OF_SUPPLY, ..., MEDIAN_DOM, ..., AVG_SALE_TO_LIST, ...
 *
 * Observed specifics:
 *  - Multiple PROPERTY_TYPE rows per period (All Residential, Condo/Co-op,
 *    Single Family Residential, Townhouse, ...). We keep ONLY "All Residential".
 *  - All rows are PERIOD_DURATION=30 (monthly) — no weekly rows to filter.
 *  - National REGION_TYPE="national" (STATE_CODE "US"); state REGION_TYPE="state"
 *    with a 2-letter STATE_CODE and full state name in REGION.
 *  - We SKIP the metro file (hundreds of MB) — see follow-ups.
 */

const SOURCE = "Redfin Data Center";

const REDFIN_URLS = {
  national:
    "https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/us_national_market_tracker.tsv000.gz",
  state:
    "https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/state_market_tracker.tsv000.gz",
} as const;

// Metrics we lift from the tracker, by column name → {metric, unit}.
const METRIC_COLUMNS: Record<string, { metric: string; unit: string }> = {
  MEDIAN_SALE_PRICE: { metric: "median_sale_price", unit: "usd" },
  HOMES_SOLD: { metric: "homes_sold", unit: "count" },
  INVENTORY: { metric: "inventory", unit: "count" },
  MEDIAN_DOM: { metric: "median_dom", unit: "days" },
  AVG_SALE_TO_LIST: { metric: "sale_to_list", unit: "percent" },
  MONTHS_OF_SUPPLY: { metric: "months_supply", unit: "count" },
};

type RedfinRowsResult = { metrics: MetricRow[]; geographies: GeoRow[] };

/**
 * Parse a Redfin tracker TSV. Keeps only PROPERTY_TYPE="All Residential" rows,
 * groups by geography, keeps the latest `months` periods per geography, and
 * emits a metric row per configured column.
 */
function parseTracker(
  text: string,
  geoLevel: GeoLevel,
  months: number,
): RedfinRowsResult {
  const lines = toLines(text);
  if (lines.length === 0) return { metrics: [], geographies: [] };

  const header = splitDelimitedLine(lines[0], "\t").map((h) => h.replace(/^"|"$/g, ""));
  const idx = (name: string) => header.indexOf(name);

  const cPeriodEnd = idx("PERIOD_END");
  const cRegionType = idx("REGION_TYPE");
  const cRegion = idx("REGION");
  const cStateCode = idx("STATE_CODE");
  const cPropertyType = idx("PROPERTY_TYPE");

  const unquote = (s: string | undefined) => (s ?? "").replace(/^"|"$/g, "").trim();

  // Group rows by geo_code so we can keep only the latest N periods each.
  type Acc = {
    geoCode: string;
    geoName: string;
    stateCode: string | null;
    // period → column → value
    byPeriod: Map<string, MetricRow[]>;
  };
  const groups = new Map<string, Acc>();

  for (let i = 1; i < lines.length; i++) {
    const cells = splitDelimitedLine(lines[i], "\t");
    if (cells.length <= cPropertyType) continue;
    if (unquote(cells[cPropertyType]) !== "All Residential") continue;

    const period = unquote(cells[cPeriodEnd]);
    if (!period) continue;

    let geoCode: string;
    let geoName: string;
    let stateCode: string | null;
    if (geoLevel === "national") {
      geoCode = "US";
      geoName = "United States";
      stateCode = null;
    } else {
      geoCode = unquote(cells[cStateCode]);
      if (!geoCode || geoCode.length !== 2) continue;
      geoName = unquote(cells[cRegion]);
      stateCode = geoCode;
    }

    let acc = groups.get(geoCode);
    if (!acc) {
      acc = { geoCode, geoName, stateCode, byPeriod: new Map() };
      groups.set(geoCode, acc);
    }

    const rows: MetricRow[] = [];
    for (const [col, spec] of Object.entries(METRIC_COLUMNS)) {
      const ci = idx(col);
      if (ci < 0) continue;
      const value = parseNum(unquote(cells[ci]));
      if (value === null) continue;
      rows.push({
        geo_level: geoLevel,
        geo_code: geoCode,
        metric: spec.metric,
        period,
        value: spec.metric === "sale_to_list" ? value * 100 : value, // ratio → percent
        unit: spec.unit,
        source: SOURCE,
      });
    }
    acc.byPeriod.set(period, rows);
  }

  const metrics: MetricRow[] = [];
  const geographies: GeoRow[] = [];
  for (const acc of groups.values()) {
    const periods = Array.from(acc.byPeriod.keys()).sort(); // ascending YYYY-MM-DD
    const keep = periods.slice(Math.max(0, periods.length - months));
    for (const p of keep) metrics.push(...(acc.byPeriod.get(p) ?? []));
    geographies.push({
      geo_level: geoLevel,
      geo_code: acc.geoCode,
      geo_name: acc.geoName,
      state: acc.stateCode,
      size_rank: geoLevel === "national" ? 0 : null,
    });
  }

  return { metrics, geographies };
}

/**
 * Ingest Redfin national + state market trackers. Best-effort per file; a failed
 * fetch is recorded in the error string and the other file still returns. The
 * metro tracker is intentionally SKIPPED (hundreds of MB — not serverless-safe).
 */
export async function ingestRedfin(months = 13): Promise<ConnectorResult> {
  const metrics: MetricRow[] = [];
  const geographies: GeoRow[] = [];
  const errors: string[] = [];

  try {
    const text = await fetchGunzippedText(REDFIN_URLS.national);
    const r = parseTracker(text, "national", months);
    metrics.push(...r.metrics);
    geographies.push(...r.geographies);
  } catch (e) {
    errors.push(`national: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const text = await fetchGunzippedText(REDFIN_URLS.state);
    const r = parseTracker(text, "state", months);
    metrics.push(...r.metrics);
    geographies.push(...r.geographies);
  } catch (e) {
    errors.push(`state: ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    source: SOURCE,
    metrics,
    geographies,
    error: errors.length ? errors.join("; ") : undefined,
  };
}
