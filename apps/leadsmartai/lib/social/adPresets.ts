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

export type AdPreset = "interest-rate" | "market-update" | "promo" | "photo" | "spotlight" | "feature" | "hook";

/** Dark themes only — the spotlight/feature designs are built for a dark hero. */
const DARK_THEMES: AdTheme[] = ["navy", "midnight", "azure"];
function darkTheme(index: number): AdTheme {
  return DARK_THEMES[((index % DARK_THEMES.length) + DARK_THEMES.length) % DARK_THEMES.length];
}

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

/** Aspirational headlines for the photo layout (lifestyle photo + overlay). */
const PHOTO_HEADLINES = [
  { headline: "Hire an AI real estate team.", subhead: "And enjoy your life. Your team answers, follows up, and coordinates — 24/7." },
  { headline: "More time for what you love.", subhead: "Your AI team handles reception, follow-up, and coordination — around the clock." },
  { headline: "Your AI team never stops closing.", subhead: "So you can focus on clients, and on life." },
  { headline: "Work fewer nights. Close more deals.", subhead: "One AI team runs the busywork while you run your business." },
  { headline: "Built for agents who want it all.", subhead: "The listings, the lifestyle, and an AI team that keeps it running." },
];

/**
 * Photo hero ad — a lifestyle/brand photo with the logo, a headline, and a CTA
 * overlaid. `photoUrl` must be a public image URL (satori + the platform fetch it).
 */
export function buildPhotoAd(
  photoUrl: string,
  index = 0,
  format: AdFormat = "square",
  theme?: AdTheme,
): AdInput {
  const h = PHOTO_HEADLINES[((index % PHOTO_HEADLINES.length) + PHOTO_HEADLINES.length) % PHOTO_HEADLINES.length];
  return { template: "photo", photoUrl, headline: h.headline, subhead: h.subhead, ctaText: "Meet your AI team", theme, format };
}

/** Spotlight direct-response copy sets (badge → two-tone headline → promise). */
const SPOTLIGHT_COPY: Array<
  Pick<AdInput, "badge" | "headline" | "headlineAccent" | "subhead" | "statLabel" | "ctaText">
> = [
  {
    badge: "REALTORS",
    headline: "You don't have a lead problem.",
    headlineAccent: "You have a follow-up gap.",
    subhead: "CloseBoss answers, texts back, and nurtures every lead — 24/7.",
    statLabel: "Every call answered. Every lead worked.",
    ctaText: "See how it works",
  },
  {
    badge: "BUSY AGENTS",
    headline: "Stop losing deals",
    headlineAccent: "to slow follow-up.",
    subhead: "Your AI team responds in seconds and never drops a lead.",
    statLabel: "Instant response. Relentless follow-up.",
    ctaText: "Meet your AI team",
  },
  {
    badge: "TOP PRODUCERS",
    headline: "Work fewer nights.",
    headlineAccent: "Close more deals.",
    subhead: "CloseBoss runs the busywork so you can run your business.",
    statLabel: "Your AI team never clocks out.",
    ctaText: "Start free",
  },
];

/** Spotlight ad — dark direct-response layout. Photo is optional (a scene photo
 *  blends best with the fade); falls back to the chart motif alone. */
export function buildSpotlightAd(
  index = 0,
  format: AdFormat = "portrait",
  theme?: AdTheme,
  photoUrl?: string,
): AdInput {
  const c = SPOTLIGHT_COPY[((index % SPOTLIGHT_COPY.length) + SPOTLIGHT_COPY.length) % SPOTLIGHT_COPY.length];
  return { template: "spotlight", ...c, photoUrl, theme: theme ?? darkTheme(index), format };
}

/** Feature poster hero rotations (the rest of the poster is fixed brand content). */
const FEATURE_COPY: Array<{ headline: string; headlineAccent: string; subhead?: string; statLabel: string }> = [
  {
    headline: "Get your",
    headlineAccent: "life back.",
    subhead: "CloseBoss AI handles the busywork so you can focus on what matters and close more deals.",
    statLabel: "Hours back every week",
  },
  {
    headline: "Run your business,",
    headlineAccent: "not the busywork.",
    subhead: "Reception, follow-up, marketing, and coordination — handled by your AI team.",
    statLabel: "Your AI team, 24/7",
  },
  {
    headline: "Your AI team",
    headlineAccent: "never stops closing.",
    subhead: "So you can focus on your clients — and on your life.",
    statLabel: "Always on. Always closing.",
  },
];

/** Feature capability poster — self-contained brand content + a rotating hero. */
export function buildFeatureAd(
  index = 0,
  format: AdFormat = "portrait",
  theme?: AdTheme,
  photoUrl?: string,
): AdInput {
  const c = FEATURE_COPY[((index % FEATURE_COPY.length) + FEATURE_COPY.length) % FEATURE_COPY.length];
  return {
    template: "feature",
    headline: c.headline,
    headlineAccent: c.headlineAccent,
    subhead: c.subhead,
    statLabel: c.statLabel,
    ctaText: "Book a demo",
    photoUrl,
    theme: theme ?? darkTheme(index),
    format,
  };
}

/** Viral-hook copy sets — big bold curiosity-gap text, claim-safe (no fabricated
 *  metrics/guarantees; only sanctioned "24/7"). Passes the claim screen. */
const HOOK_COPY: Array<
  Pick<AdInput, "badge" | "headline" | "headlineAccent" | "subhead" | "ctaText">
> = [
  {
    badge: "For real estate agents",
    headline: "Your best lead went cold",
    headlineAccent: "while you slept.",
    subhead: "Your AI team answers every call, texts back every missed lead, and follows up 24/7 — so no lead ever waits.",
    ctaText: "Here's the fix",
  },
  {
    badge: "Busy agents",
    headline: "You're losing deals",
    headlineAccent: "to slow replies.",
    subhead: "The first agent to respond usually wins. Your AI team replies in seconds, day or night.",
    ctaText: "See how",
  },
  {
    badge: "Realtors",
    headline: "Stop working nights",
    headlineAccent: "and weekends.",
    subhead: "Let your AI team handle reception, follow-up, and coordination — so you get your time back.",
    ctaText: "Meet your AI team",
  },
  {
    badge: "For agents",
    headline: "A missed call is",
    headlineAccent: "a missed commission.",
    subhead: "Every unanswered call is a lead calling someone else next. Your AI receptionist never misses one.",
    ctaText: "Here's how",
  },
];

/** Viral engagement hook — big bold text card, dark theme, claim-safe copy. */
export function buildHookAd(index = 0, format: AdFormat = "portrait", theme?: AdTheme): AdInput {
  const c = HOOK_COPY[((index % HOOK_COPY.length) + HOOK_COPY.length) % HOOK_COPY.length];
  return { template: "hook", ...c, theme: theme ?? darkTheme(index), format };
}

/**
 * Dispatch a preset name to its builder. Theme rotates by index when not given,
 * so consecutive scheduled posts vary their look. Returns null if data is
 * unavailable (e.g. market-update with no city).
 */
export async function buildPresetAd(
  preset: AdPreset,
  opts: { city?: string; photoUrl?: string; index?: number; theme?: AdTheme; format?: AdFormat } = {},
): Promise<AdInput | null> {
  const format = opts.format ?? "square";
  const index = opts.index ?? 0;
  const theme = opts.theme ?? pickThemeForIndex(index);
  if (preset === "interest-rate") return buildInterestRateAd(format, theme);
  if (preset === "market-update") {
    return opts.city ? buildMarketUpdateAd(opts.city, format, theme) : null;
  }
  if (preset === "photo") {
    return opts.photoUrl ? buildPhotoAd(opts.photoUrl, index, format, theme) : null;
  }
  if (preset === "spotlight") return buildSpotlightAd(index, format, theme, opts.photoUrl);
  if (preset === "feature") return buildFeatureAd(index, format, theme, opts.photoUrl);
  if (preset === "hook") return buildHookAd(index, format, theme);
  return buildPromoAd(index, format, theme);
}
