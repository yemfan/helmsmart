import "server-only";

import type { ConnectorResult, GeoLevel, GeoRow, MetricRow } from "./types";
import {
  STATE_NAME_TO_CODE,
  fetchText,
  parseNum,
  splitDelimitedLine,
  toLines,
} from "./parse";

/**
 * Zillow Research connector for the market warehouse.
 *
 * Verified 2026-07-06 against https://www.zillow.com/research/data/ — all four
 * CSVs return 200 from files.zillowstatic.com. Wide format, comma-delimited:
 *
 *   RegionID,SizeRank,RegionName,RegionType,StateName,<date cols YYYY-MM-DD...>
 *
 * Observed specifics:
 *  - Metro files: row for national is `102001,0,United States,country,` (empty
 *    StateName); metros are `...,msa,<2-letter state>`; RegionName may be quoted
 *    and contain a comma, e.g. "New York, NY". SizeRank 0 = national, ascending.
 *  - State ZHVI file: `RegionType=state`, StateName EMPTY, and RegionName holds
 *    the FULL state name ("California") — we map that to a 2-letter code.
 *  - Date columns end at the current month (e.g. 2026-05-31); ZHVI metro CSV ~4.4MB.
 *
 * We ingest, per file, the LAST `months` date columns (trailing history) for
 * national + metro (capped to the top `metroCap` by SizeRank), plus state ZHVI
 * from the State file. Metrics: zhvi (index, usd-ish), inventory (count),
 * median_dom (days).
 */

const SOURCE = "Zillow Research";

const ZILLOW_URLS = {
  zhviMetro:
    "https://files.zillowstatic.com/research/public_csvs/zhvi/Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv",
  zhviState:
    "https://files.zillowstatic.com/research/public_csvs/zhvi/State_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv",
  inventoryMetro:
    "https://files.zillowstatic.com/research/public_csvs/invt_fs/Metro_invt_fs_uc_sfrcondo_sm_month.csv",
  domMetro:
    "https://files.zillowstatic.com/research/public_csvs/med_doz_pending/Metro_med_doz_pending_uc_sfrcondo_sm_month.csv",
} as const;

// Fixed leading columns in every Zillow wide CSV.
const META_COLS = 5; // RegionID, SizeRank, RegionName, RegionType, StateName

type ParsedWide = {
  dateCols: string[]; // the date header columns (index-aligned to rows after META_COLS)
  rows: {
    regionId: string;
    sizeRank: number | null;
    regionName: string;
    regionType: string;
    stateName: string;
    values: string[]; // aligned to dateCols
  }[];
};

/** Parse a wide Zillow CSV string into header date columns + typed rows. */
function parseWideCsv(text: string): ParsedWide {
  const lines = toLines(text);
  if (lines.length === 0) return { dateCols: [], rows: [] };

  const header = splitDelimitedLine(lines[0], ",");
  const dateCols = header.slice(META_COLS);

  const rows: ParsedWide["rows"] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitDelimitedLine(lines[i], ",");
    if (cells.length < META_COLS) continue;
    rows.push({
      regionId: cells[0],
      sizeRank: parseNum(cells[1]),
      regionName: cells[2],
      regionType: cells[3],
      stateName: cells[4],
      values: cells.slice(META_COLS),
    });
  }
  return { dateCols, rows };
}

/** Normalize a Zillow date column ("2026-05-31") to a month-end date string. */
function toPeriod(dateCol: string): string {
  return dateCol; // already YYYY-MM-DD (month end); stored as-is
}

/**
 * Emit trailing metric rows for one wide-CSV row. `keepLast` is how many trailing
 * date columns to keep.
 */
function emitMetricRows(
  geoLevel: GeoLevel,
  geoCode: string,
  metric: string,
  unit: string,
  dateCols: string[],
  values: string[],
  keepLast: number,
): MetricRow[] {
  const start = Math.max(0, dateCols.length - keepLast);
  const out: MetricRow[] = [];
  for (let i = start; i < dateCols.length; i++) {
    const value = parseNum(values[i]);
    if (value === null) continue; // skip gaps
    out.push({
      geo_level: geoLevel,
      geo_code: geoCode,
      metric,
      period: toPeriod(dateCols[i]),
      value,
      unit,
      source: SOURCE,
    });
  }
  return out;
}

/**
 * Process a metro-level wide file (national row + metros). Emits national ('US')
 * + metro rows for `metric`, and returns metro GeoRows for the dimension.
 * Metros are capped to the top `metroCap` by SizeRank (excluding national).
 */
function processMetroFile(
  parsed: ParsedWide,
  metric: string,
  unit: string,
  months: number,
  metroCap: number,
): { metrics: MetricRow[]; geographies: GeoRow[] } {
  const metrics: MetricRow[] = [];
  const geographies: GeoRow[] = [];

  // Sort metros by SizeRank ascending; national (rank 0 / country) handled separately.
  const metros = parsed.rows
    .filter((r) => r.regionType === "msa" && r.sizeRank !== null)
    .sort((a, b) => (a.sizeRank ?? 1e9) - (b.sizeRank ?? 1e9))
    .slice(0, metroCap);

  const national = parsed.rows.find((r) => r.regionType === "country");
  if (national) {
    metrics.push(
      ...emitMetricRows("national", "US", metric, unit, parsed.dateCols, national.values, months),
    );
  }

  for (const m of metros) {
    metrics.push(
      ...emitMetricRows("metro", m.regionId, metric, unit, parsed.dateCols, m.values, months),
    );
    geographies.push({
      geo_level: "metro",
      geo_code: m.regionId,
      geo_name: m.regionName,
      state: m.stateName || null,
      size_rank: m.sizeRank,
    });
  }

  return { metrics, geographies };
}

/**
 * Ingest Zillow ZHVI (metro + state), for-sale inventory (metro), and median
 * days-to-pending (metro). Best-effort per file; a failed fetch is recorded in
 * the error string and the other files still return.
 *
 * @param months  trailing date columns to keep per region (default 13)
 * @param metroCap top-N metros by SizeRank (default 300)
 */
export async function ingestZillow(months = 13, metroCap = 300): Promise<ConnectorResult> {
  const metrics: MetricRow[] = [];
  const geoByKey = new Map<string, GeoRow>(); // dedupe metros across files
  const errors: string[] = [];

  const addGeo = (g: GeoRow) => {
    const key = `${g.geo_level}:${g.geo_code}`;
    // Prefer a row that carries a size_rank / state if we already have one without.
    const existing = geoByKey.get(key);
    if (!existing || (existing.size_rank === null && g.size_rank !== null)) {
      geoByKey.set(key, g);
    }
  };

  // --- ZHVI metro (national + metros) ---
  try {
    const parsed = parseWideCsv(await fetchText(ZILLOW_URLS.zhviMetro));
    const { metrics: m, geographies: g } = processMetroFile(
      parsed,
      "zhvi",
      "index",
      months,
      metroCap,
    );
    metrics.push(...m);
    g.forEach(addGeo);
  } catch (e) {
    errors.push(`zhviMetro: ${e instanceof Error ? e.message : String(e)}`);
  }

  // --- ZHVI state ---
  try {
    const parsed = parseWideCsv(await fetchText(ZILLOW_URLS.zhviState));
    for (const r of parsed.rows) {
      if (r.regionType !== "state") continue;
      const code = STATE_NAME_TO_CODE[r.regionName.trim()];
      if (!code) continue; // skip territories / unmapped
      metrics.push(
        ...emitMetricRows("state", code, "zhvi", "index", parsed.dateCols, r.values, months),
      );
      addGeo({
        geo_level: "state",
        geo_code: code,
        geo_name: r.regionName,
        state: code,
        size_rank: r.sizeRank,
      });
    }
  } catch (e) {
    errors.push(`zhviState: ${e instanceof Error ? e.message : String(e)}`);
  }

  // --- Inventory metro (national + metros) ---
  try {
    const parsed = parseWideCsv(await fetchText(ZILLOW_URLS.inventoryMetro));
    const { metrics: m, geographies: g } = processMetroFile(
      parsed,
      "inventory",
      "count",
      months,
      metroCap,
    );
    metrics.push(...m);
    g.forEach(addGeo);
  } catch (e) {
    errors.push(`inventoryMetro: ${e instanceof Error ? e.message : String(e)}`);
  }

  // --- Median days-to-pending metro (national + metros) ---
  try {
    const parsed = parseWideCsv(await fetchText(ZILLOW_URLS.domMetro));
    const { metrics: m, geographies: g } = processMetroFile(
      parsed,
      "median_dom",
      "days",
      months,
      metroCap,
    );
    metrics.push(...m);
    g.forEach(addGeo);
  } catch (e) {
    errors.push(`domMetro: ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    source: SOURCE,
    metrics,
    geographies: Array.from(geoByKey.values()),
    error: errors.length ? errors.join("; ") : undefined,
  };
}
