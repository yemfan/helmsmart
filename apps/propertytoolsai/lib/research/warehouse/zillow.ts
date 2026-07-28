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
  // County files share the SAME wide format as metro but with EXTRA leading meta
  // columns (State, Metro, StateCodeFIPS, MunicipalCodeFIPS) between StateName and
  // the date columns — 9 meta cols vs 5. parseWideCsv detects the meta-column
  // count dynamically, so RegionID/SizeRank/RegionName/RegionType/StateName (cols
  // 0-4, identical positions) still read correctly. County files have no national
  // row. RegionName = "<County> County"; StateName (col 4) = 2-letter state.
  zhviCounty:
    "https://files.zillowstatic.com/research/public_csvs/zhvi/County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv",
  inventoryCounty:
    "https://files.zillowstatic.com/research/public_csvs/invt_fs/County_invt_fs_uc_sfrcondo_sm_month.csv",
  domCounty:
    "https://files.zillowstatic.com/research/public_csvs/med_doz_pending/County_med_doz_pending_uc_sfrcondo_sm_month.csv",
} as const;

// The number of leading meta columns before the date columns VARIES by file:
// metro/state = 5, county = 9. Detected per-file in parseWideCsv by finding the
// first header cell that is an ISO date. This fallback is used only if none match.
const DEFAULT_META_COLS = 5; // RegionID, SizeRank, RegionName, RegionType, StateName
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
  // Meta columns are everything before the first ISO-date header cell. Metro/state
  // files have 5; county files have 9 (extra State/Metro/FIPS columns). Detecting
  // it keeps a single parser correct for every Zillow wide CSV.
  const firstDateIdx = header.findIndex((h) => ISO_DATE.test(h.trim()));
  const metaCols = firstDateIdx >= 0 ? firstDateIdx : DEFAULT_META_COLS;
  const dateCols = header.slice(metaCols);

  const rows: ParsedWide["rows"] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitDelimitedLine(lines[i], ",");
    if (cells.length < metaCols) continue;
    rows.push({
      // Cols 0-4 are identically positioned across metro/state/county files.
      regionId: cells[0],
      sizeRank: parseNum(cells[1]),
      regionName: cells[2],
      regionType: cells[3],
      stateName: cells[4],
      values: cells.slice(metaCols),
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
 * Process a wide file for one region tier. Emits metric rows (+ the national 'US'
 * row when present) and returns the region GeoRows for the dimension. Regions are
 * capped to the top `cap` by SizeRank.
 *
 * `regionType` is the Zillow RegionType to keep ("msa" for metros, "county" for
 * counties); `level` is the warehouse geo_level to store. Metro files carry a
 * national ("country") row we always emit; county files don't have one.
 */
function processRegionFile(
  parsed: ParsedWide,
  opts: {
    metric: string;
    unit: string;
    months: number;
    cap: number;
    regionType: string;
    level: GeoLevel;
  },
): { metrics: MetricRow[]; geographies: GeoRow[] } {
  const { metric, unit, months, cap, regionType, level } = opts;
  const metrics: MetricRow[] = [];
  const geographies: GeoRow[] = [];

  const regions = parsed.rows
    .filter((r) => r.regionType === regionType && r.sizeRank !== null)
    .sort((a, b) => (a.sizeRank ?? 1e9) - (b.sizeRank ?? 1e9))
    .slice(0, cap);

  // Metro files include a national ("country") row; county files do not.
  const national = parsed.rows.find((r) => r.regionType === "country");
  if (national) {
    metrics.push(
      ...emitMetricRows("national", "US", metric, unit, parsed.dateCols, national.values, months),
    );
  }

  for (const r of regions) {
    metrics.push(
      ...emitMetricRows(level, r.regionId, metric, unit, parsed.dateCols, r.values, months),
    );
    geographies.push({
      geo_level: level,
      geo_code: r.regionId,
      geo_name: r.regionName,
      state: r.stateName || null,
      size_rank: r.sizeRank,
    });
  }

  return { metrics, geographies };
}

/**
 * Ingest Zillow ZHVI (metro + state), for-sale inventory (metro), and median
 * days-to-pending (metro). Best-effort per file; a failed fetch is recorded in
 * the error string and the other files still return.
 *
 * @param months    trailing date columns to keep per region (default 13)
 * @param metroCap  top-N metros by SizeRank (default 300)
 * @param countyCap top-N counties by SizeRank (default 1000; ~90%+ of population)
 */
export async function ingestZillow(
  months = 13,
  metroCap = 300,
  countyCap = 1000,
): Promise<ConnectorResult> {
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
    const { metrics: m, geographies: g } = processRegionFile(parsed, {
      metric: "zhvi",
      unit: "index",
      months,
      cap: metroCap,
      regionType: "msa",
      level: "metro",
    });
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
    const { metrics: m, geographies: g } = processRegionFile(parsed, {
      metric: "inventory",
      unit: "count",
      months,
      cap: metroCap,
      regionType: "msa",
      level: "metro",
    });
    metrics.push(...m);
    g.forEach(addGeo);
  } catch (e) {
    errors.push(`inventoryMetro: ${e instanceof Error ? e.message : String(e)}`);
  }

  // --- Median days-to-pending metro (national + metros) ---
  try {
    const parsed = parseWideCsv(await fetchText(ZILLOW_URLS.domMetro));
    const { metrics: m, geographies: g } = processRegionFile(parsed, {
      metric: "median_dom",
      unit: "days",
      months,
      cap: metroCap,
      regionType: "msa",
      level: "metro",
    });
    metrics.push(...m);
    g.forEach(addGeo);
  } catch (e) {
    errors.push(`domMetro: ${e instanceof Error ? e.message : String(e)}`);
  }

  // --- ZHVI county (top-N counties by SizeRank) ---
  try {
    const parsed = parseWideCsv(await fetchText(ZILLOW_URLS.zhviCounty));
    const { metrics: m, geographies: g } = processRegionFile(parsed, {
      metric: "zhvi",
      unit: "index",
      months,
      cap: countyCap,
      regionType: "county",
      level: "county",
    });
    metrics.push(...m);
    g.forEach(addGeo);
  } catch (e) {
    errors.push(`zhviCounty: ${e instanceof Error ? e.message : String(e)}`);
  }

  // --- Inventory county ---
  try {
    const parsed = parseWideCsv(await fetchText(ZILLOW_URLS.inventoryCounty));
    const { metrics: m, geographies: g } = processRegionFile(parsed, {
      metric: "inventory",
      unit: "count",
      months,
      cap: countyCap,
      regionType: "county",
      level: "county",
    });
    metrics.push(...m);
    g.forEach(addGeo);
  } catch (e) {
    errors.push(`inventoryCounty: ${e instanceof Error ? e.message : String(e)}`);
  }

  // --- Median days-to-pending county ---
  try {
    const parsed = parseWideCsv(await fetchText(ZILLOW_URLS.domCounty));
    const { metrics: m, geographies: g } = processRegionFile(parsed, {
      metric: "median_dom",
      unit: "days",
      months,
      cap: countyCap,
      regionType: "county",
      level: "county",
    });
    metrics.push(...m);
    g.forEach(addGeo);
  } catch (e) {
    errors.push(`domCounty: ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    source: SOURCE,
    metrics,
    geographies: Array.from(geoByKey.values()),
    error: errors.length ? errors.join("; ") : undefined,
  };
}
