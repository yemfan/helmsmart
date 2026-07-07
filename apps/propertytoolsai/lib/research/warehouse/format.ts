import type { LatestMetric, SeriesPoint } from "./read";

/**
 * Deterministic formatting + insight helpers for the Data Center market pages.
 *
 * Every number rendered on a data page flows through here so pages read from the
 * REAL warehouse values (no fabrication, no per-page AI). Narrative sentences are
 * composed FROM the computed deltas, so no two geographies read identically.
 */

/** Human labels + presentation hints for each warehouse metric key. */
export const METRIC_META: Record<
  string,
  { label: string; short: string; blurb?: string }
> = {
  zhvi: {
    label: "Typical home value (ZHVI)",
    short: "Home value",
    blurb:
      "The Zillow Home Value Index is a smoothed measure of the typical home value, not a raw sale price.",
  },
  median_sale_price: { label: "Median sale price", short: "Sale price" },
  inventory: { label: "Homes for sale", short: "Inventory" },
  median_dom: { label: "Median days on market", short: "Days on market" },
  months_supply: { label: "Months of supply", short: "Months supply" },
  homes_sold: { label: "Homes sold", short: "Homes sold" },
  sale_to_list: { label: "Sale-to-list ratio", short: "Sale-to-list" },
  new_home_inventory: { label: "New-home inventory", short: "New-home inv." },
  mortgage_30yr: { label: "30-year fixed mortgage rate", short: "30-yr rate" },
  mortgage_15yr: { label: "15-year fixed mortgage rate", short: "15-yr rate" },
  treasury_10yr: { label: "10-year Treasury yield", short: "10-yr Treasury" },
};

/** Preferred display order (headline metrics first). */
export const METRIC_ORDER = [
  "zhvi",
  "median_sale_price",
  "median_dom",
  "inventory",
  "months_supply",
  "homes_sold",
  "sale_to_list",
  "new_home_inventory",
  "mortgage_30yr",
  "mortgage_15yr",
  "treasury_10yr",
];

export function metricLabel(metric: string): string {
  return METRIC_META[metric]?.label ?? metric;
}

export function isNum(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Unit-aware value formatting. `compact` uses $K/$M for large USD/count values
 * (stat grids); otherwise full grouping. Missing values render as "—".
 */
export function formatValue(
  value: number | null | undefined,
  unit: string | null | undefined,
  opts: { compact?: boolean } = {},
): string {
  if (!isNum(value)) return "—";
  const u = unit ?? "";
  switch (u) {
    case "usd":
    case "index": {
      if (opts.compact) return formatCompactUsd(value);
      return `$${Math.round(value).toLocaleString("en-US")}`;
    }
    case "count":
      return Math.round(value).toLocaleString("en-US");
    case "days": {
      const d = Math.round(value);
      return `${d.toLocaleString("en-US")} ${d === 1 ? "day" : "days"}`;
    }
    case "percent":
      return `${value.toFixed(1)}%`;
    default:
      return value.toLocaleString("en-US");
  }
}

/** $440K / $1.2M compact USD for stat tiles. */
export function formatCompactUsd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `$${Math.round(value / 1000)}K`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

/** Compact number (1.4M / 22K) for count tiles. */
export function formatCompactCount(value: number | null | undefined): string {
  if (!isNum(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${Math.round(value / 1000)}K`;
  return Math.round(value).toLocaleString("en-US");
}

/** A signed, unit-aware percentage change, e.g. "+3.2%" / "-1.0%" / "—". */
export function formatPct(delta: number | null): string {
  if (!isNum(delta)) return "—";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

export type Change = {
  /** percentage change (latest vs prior), null when either side missing */
  pct: number | null;
  /** absolute change in native units, null when either side missing */
  abs: number | null;
  direction: "up" | "down" | "flat" | "unknown";
};

function changeFrom(latest: number | null, prior: number | null): Change {
  if (!isNum(latest) || !isNum(prior) || prior === 0) {
    if (isNum(latest) && isNum(prior)) {
      const abs = latest - prior;
      return {
        pct: null,
        abs,
        direction: abs > 0 ? "up" : abs < 0 ? "down" : "flat",
      };
    }
    return { pct: null, abs: null, direction: "unknown" };
  }
  const abs = latest - prior;
  const pct = (abs / prior) * 100;
  const direction = pct > 0.05 ? "up" : pct < -0.05 ? "down" : "flat";
  return { pct, abs, direction };
}

/**
 * Month-over-month change from a series (latest vs the point before it).
 */
export function momChange(series: SeriesPoint[]): Change {
  if (series.length < 2) return { pct: null, abs: null, direction: "unknown" };
  const latest = series[series.length - 1]?.value ?? null;
  const prior = series[series.length - 2]?.value ?? null;
  return changeFrom(latest, prior);
}

/**
 * Year-over-year change: latest vs the point 12 periods earlier (monthly data).
 * Returns unknown when there aren't 13 points.
 */
export function yoyChange(series: SeriesPoint[]): Change {
  if (series.length < 13) return { pct: null, abs: null, direction: "unknown" };
  const latest = series[series.length - 1]?.value ?? null;
  const prior = series[series.length - 13]?.value ?? null;
  return changeFrom(latest, prior);
}

/** Latest non-null value in a series (with its period). */
export function latestPoint(series: SeriesPoint[]): SeriesPoint | null {
  for (let i = series.length - 1; i >= 0; i--) {
    if (isNum(series[i]?.value)) return series[i];
  }
  return null;
}

/**
 * Relative comparison of two latest values as a signed percent (a vs b).
 * e.g. metro ZHVI vs national ZHVI → "+12.4%" (metro is 12.4% higher).
 */
export function relativePct(
  a: number | null | undefined,
  b: number | null | undefined,
): number | null {
  if (!isNum(a) || !isNum(b) || b === 0) return null;
  return ((a - b) / b) * 100;
}

/** Find a metric in a LatestMetric[] set. */
export function findMetric(
  metrics: LatestMetric[],
  metric: string,
): LatestMetric | null {
  return metrics.find((m) => m.metric === metric) ?? null;
}

/** "higher than" / "lower than" / "about the same as" phrasing for a delta. */
export function comparePhrase(pct: number | null): string {
  if (!isNum(pct)) return "not directly comparable to";
  const abs = Math.abs(pct);
  if (abs < 1) return "about the same as";
  const dir = pct > 0 ? "higher than" : "lower than";
  return `${abs.toFixed(1)}% ${dir}`;
}

/** Format a YYYY-MM-DD period as "June 2026". */
export function formatPeriod(period: string | null | undefined): string {
  if (!period) return "";
  const dt = new Date(`${period}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return period;
  return dt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}
