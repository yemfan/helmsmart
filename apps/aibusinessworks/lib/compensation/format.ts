import type { Bps, Cents } from "./types";

/** 2500 -> "25%", 550 -> "5.5%". */
export function formatBps(bps: Bps): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0$/, "")}%`;
}

/** 2500 -> 25 (for numeric display in hero tiles). */
export function bpsToPercent(bps: Bps): number {
  return bps / 100;
}

export function percentToBps(percent: number): Bps {
  return Math.round(percent * 100);
}

export function formatCents(cents: Cents, currency = "USD", locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Compact money for dashboard tiles: 123456 -> "$1,234.56", 1234567890 -> "$12.3M". */
export function formatCentsCompact(cents: Cents, currency = "USD"): string {
  const value = cents / 100;
  if (Math.abs(value) >= 1_000_000) {
    return `${currency === "USD" ? "$" : ""}${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 10_000) {
    return `${currency === "USD" ? "$" : ""}${(value / 1000).toFixed(1)}K`;
  }
  return formatCents(cents, currency);
}

export function formatMonthsAsYears(months: number): string {
  if (months % 12 === 0) {
    const years = months / 12;
    return `${years} ${years === 1 ? "year" : "years"}`;
  }
  return `${months} months`;
}
