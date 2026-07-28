import "server-only";

import { getLatestMetrics } from "@/lib/research/warehouse/read";
import { getMetroBySlug, getMetroSnapshot } from "@/lib/trafficMetros";
import { pickThemeForIndex, type AdFormat, type AdInput, type AdTheme } from "./renderAd";

/**
 * Preset ad builders — turn a recurring content TYPE into a filled AdInput using
 * REAL Data Center warehouse figures, so the Marketing Assistant can auto-produce
 * on-brand graphics with live numbers (no fabrication, no manual data entry).
 *
 *   - "interest-rate"  → national mortgage 30/15-yr + 10-yr Treasury (stat card)
 *   - "market-update"  → a metro's typical value + YoY + days-on-market (stat card)
 *   - "promo"          → a rotating promotional statement (bold card)
 *
 * Video presets are handled separately via the Remotion reel composition.
 */

export type AdPreset = "interest-rate" | "market-update" | "promo";

/** "2026-07-02" -> "July 2026". */
function monthYear(period: string | null | undefined): string | null {
  if (!period) return null;
  const d = new Date(period);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function pct(n: number | null | undefined): string | null {
  return typeof n === "number" ? `${n.toFixed(1)}%` : null;
}

/** National mortgage-rate snapshot → stat card. */
export async function buildInterestRateAd(
  format: AdFormat = "square",
  theme?: AdTheme,
): Promise<AdInput> {
  const latest = await getLatestMetrics("national", "US");
  const by = new Map(latest.map((m) => [m.metric, m]));
  const r30 = by.get("mortgage_30yr")?.value ?? null;
  const r15 = by.get("mortgage_15yr")?.value ?? null;
  const t10 = by.get("treasury_10yr")?.value ?? null;
  const when = monthYear(by.get("mortgage_30yr")?.period);

  const context = [
    pct(r15) ? `15-yr fixed ${pct(r15)}` : null,
    pct(t10) ? `10-yr Treasury ${pct(t10)}` : null,
  ]
    .filter(Boolean)
    .join("   ·   ");

  return {
    template: "stat",
    headline: "Mortgage rate update",
    statValue: pct(r30) ?? "—",
    statLabel: `30-YEAR FIXED MORTGAGE${when ? ` · ${when.toUpperCase()}` : ""}`,
    statContext: `${context}${context ? ". " : ""}Know your buyer's real budget before you show.`,
    theme,
    format,
  };
}

/** A metro's market snapshot → stat card. Returns null for an unknown metro. */
export async function buildMarketUpdateAd(
  citySlug: string,
  format: AdFormat = "square",
  theme?: AdTheme,
): Promise<AdInput | null> {
  const metro = await getMetroBySlug(citySlug);
  if (!metro) return null;
  const snap = await getMetroSnapshot(metro.geoLevel, metro.geoCode);

  const value =
    snap.typicalValue != null ? `$${Math.round(snap.typicalValue / 1000).toLocaleString()}K` : "—";
  const bits = [
    snap.yoyChangePct != null
      ? `${snap.yoyChangePct >= 0 ? "↑" : "↓"} ${Math.abs(snap.yoyChangePct)}% YoY`
      : null,
    snap.medianDaysOnMarket != null ? `${Math.round(snap.medianDaysOnMarket)} days on market` : null,
    snap.inventory != null ? `${Math.round(snap.inventory).toLocaleString()} homes for sale` : null,
  ].filter(Boolean);
  const when = monthYear(snap.period);

  return {
    template: "stat",
    headline: `${metro.city} market update`,
    statValue: value,
    statLabel: `${metro.city.toUpperCase()}, ${metro.state} · TYPICAL HOME VALUE${when ? ` · ${when.toUpperCase()}` : ""}`,
    statContext: bits.join("   ·   ") || "Ask me for a full local report.",
    theme,
    format,
  };
}

/** Rotating promotional statements (bold card). Index picks the message. */
const PROMOS: Array<Pick<AdInput, "headline" | "subhead" | "ctaText">> = [
  {
    headline: "Missed calls cost you deals.",
    subhead: "Your AI team answers every call and texts back every missed lead — 24/7.",
    ctaText: "Meet your AI team",
  },
  {
    headline: "Your leads called. We already answered.",
    subhead: "AI receptionist, follow-up, and transaction coordination — around the clock.",
    ctaText: "Start free",
  },
  {
    headline: "Close more deals without hiring.",
    subhead: "One AI team handles reception, sales follow-up, marketing, and coordination.",
    ctaText: "See how it works",
  },
];

export function buildPromoAd(index = 0, format: AdFormat = "square", theme?: AdTheme): AdInput {
  const p = PROMOS[((index % PROMOS.length) + PROMOS.length) % PROMOS.length];
  return { template: "bold", ...p, theme, format };
}

/**
 * Dispatch a preset name to its builder. Theme rotates by index when not given,
 * so consecutive scheduled posts vary their look. Returns null if data is
 * unavailable (e.g. market-update with no city).
 */
export async function buildPresetAd(
  preset: AdPreset,
  opts: { city?: string; index?: number; theme?: AdTheme; format?: AdFormat } = {},
): Promise<AdInput | null> {
  const format = opts.format ?? "square";
  const theme = opts.theme ?? pickThemeForIndex(opts.index ?? 0);
  if (preset === "interest-rate") return buildInterestRateAd(format, theme);
  if (preset === "market-update") {
    return opts.city ? buildMarketUpdateAd(opts.city, format, theme) : null;
  }
  return buildPromoAd(opts.index ?? 0, format, theme);
}
