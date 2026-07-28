import "server-only";
import { cache } from "react";

import {
  getLatestMetrics,
  getMetricSeries,
  listActiveGeographies,
} from "@/lib/research/warehouse/read";
import { stateName } from "@/lib/research/warehouse/slug";
import { slugify } from "@/lib/research/warehouse/slug";
import {
  buildLongTailKeywordSet,
  keywordToSlug,
  TRAFFIC_CITIES,
  type PageType,
  type Trend,
} from "@/lib/trafficSeo";

/**
 * Warehouse-backed metro provider for the programmatic traffic-SEO pages
 * (/home-value, /sell-house, /market-report).
 *
 * This replaces the hand-maintained TRAFFIC_CITIES list with the ~305 active
 * metros in the Data Center market warehouse (market_geographies + market_metrics),
 * so every page carries REAL, current figures (Zillow ZHVI, median days on market,
 * inventory) instead of hardcoded approximations — and coverage scales to the full
 * MSA universe automatically as the warehouse grows.
 *
 * The metro slug is slugify(geo_name) — e.g. "Los Angeles, CA" -> "los-angeles-ca"
 * — which matches the slug format the traffic pages already used, so inbound links
 * and canonicals for the major cities carry through unchanged.
 *
 * All reads go through the service-role warehouse helpers (RLS-deny tables). If
 * the warehouse is unreachable, listTrafficMetros() returns [] and the routes
 * render nothing rather than crashing.
 */

export type PlaceLevel = "metro" | "county" | "zip";

export type TrafficMetro = {
  /** URL slug — metros "los-angeles-ca"; counties "los-angeles-county-ca". */
  slug: string;
  /** Display name, e.g. "Los Angeles" or "Los Angeles County". */
  city: string;
  /** 2-letter state code, e.g. "CA". */
  state: string;
  /** Full state name, e.g. "California". */
  stateName: string;
  /** Opaque Zillow RegionID (warehouse geo_code). */
  geoCode: string;
  /** Warehouse geo_level this place reads from. */
  geoLevel: PlaceLevel;
  /** Zillow SizeRank — lower is larger. */
  sizeRank: number | null;
};

export type MetroSnapshot = {
  /** Typical home value (Zillow ZHVI), USD. null when unavailable. */
  typicalValue: number | null;
  /** Year-over-year change in typical value, percent. null when unavailable. */
  yoyChangePct: number | null;
  /** Median days on market. null when unavailable. */
  medianDaysOnMarket: number | null;
  /** For-sale inventory (count). null when unavailable. */
  inventory: number | null;
  /** Direction derived from YoY change. */
  trend: Trend;
  /** Latest data period (YYYY-MM-DD), or null. */
  period: string | null;
};

/** Split a warehouse geo_name ("Los Angeles, CA") into its display city part. */
function cityFromGeoName(geoName: string): string {
  const comma = geoName.indexOf(",");
  return (comma === -1 ? geoName : geoName.slice(0, comma)).trim();
}

/**
 * All active metros, largest-first. Cached per request/build so the 6 traffic
 * routes + sitemap share a single warehouse round-trip.
 */
export const listTrafficMetros = cache(async (): Promise<TrafficMetro[]> => {
  const geos = await listActiveGeographies("metro");
  // Resilience: if the warehouse is unreachable at build/runtime, fall back to
  // the curated seed list so the routes still exist (metric cards just render
  // empty — never fabricated, never a 404). Warehouse data supersedes it.
  if (geos.length === 0) {
    return TRAFFIC_CITIES.map((c) => ({
      slug: c.slug,
      city: c.city,
      state: c.state,
      stateName: stateName(c.state),
      geoCode: "", // no warehouse code -> empty snapshot, graceful render
      geoLevel: "metro" as const,
      sizeRank: null,
    }));
  }
  const out: TrafficMetro[] = [];
  const seen = new Set<string>();
  for (const g of geos) {
    const slug = slugify(g.geo_name);
    // Guard against slug collisions (two metros slugifying identically) — first
    // (larger, since ordered by size_rank) wins so a slug always resolves stably.
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      slug,
      city: cityFromGeoName(g.geo_name),
      state: g.state ?? "",
      stateName: g.state ? stateName(g.state) : "",
      geoCode: g.geo_code,
      geoLevel: "metro",
      sizeRank: g.size_rank,
    });
  }
  return out;
});

/**
 * All active counties, largest-first. County names collide across states
 * ("Washington County" is in ~30 states), so the slug is
 * slugify(geo_name)+"-"+state -> "los-angeles-county-ca". Distinct from every
 * metro slug (which has no "-county-" segment), so metros and counties coexist
 * safely in the same route space. Empty if the warehouse has no county rows yet.
 */
export const listTrafficCounties = cache(async (): Promise<TrafficMetro[]> => {
  const geos = await listActiveGeographies("county");
  const out: TrafficMetro[] = [];
  const seen = new Set<string>();
  for (const g of geos) {
    const st = (g.state ?? "").toLowerCase();
    const base = slugify(g.geo_name);
    const slug = st ? `${base}-${st}` : base;
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      slug,
      city: g.geo_name, // "Los Angeles County" reads correctly as-is
      state: g.state ?? "",
      stateName: g.state ? stateName(g.state) : "",
      geoCode: g.geo_code,
      geoLevel: "county",
      sizeRank: g.size_rank,
    });
  }
  return out;
});

/**
 * All active ZIPs, largest-first. In the warehouse, ZIP geo_code IS the ZIP
 * ("77494") and geo_name is its City ("Katy"), so slug = the ZIP and the display
 * name reads "77494 (Katy)". ZIP slugs are numeric, so they never collide with
 * metro/county slugs. Empty if the warehouse has no ZIP rows yet.
 */
export const listTrafficZips = cache(async (): Promise<TrafficMetro[]> => {
  const geos = await listActiveGeographies("zip");
  const out: TrafficMetro[] = [];
  const seen = new Set<string>();
  for (const g of geos) {
    const zip = g.geo_code.trim();
    const slug = slugify(zip);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const cityName = g.geo_name && g.geo_name !== zip ? `${zip} (${g.geo_name})` : zip;
    out.push({
      slug,
      city: cityName,
      state: g.state ?? "",
      stateName: g.state ? stateName(g.state) : "",
      geoCode: g.geo_code,
      geoLevel: "zip",
      sizeRank: g.size_rank,
    });
  }
  return out;
});

/** Metros + counties + ZIPs, cached — the full "place" universe the routes resolve. */
export const listTrafficPlaces = cache(async (): Promise<TrafficMetro[]> => {
  const [metros, counties, zips] = await Promise.all([
    listTrafficMetros(),
    listTrafficCounties(),
    listTrafficZips(),
  ]);
  return [...metros, ...counties, ...zips];
});

export async function getMetroBySlug(slug: string): Promise<TrafficMetro | null> {
  const target = slug.trim().toLowerCase();
  if (!target) return null;
  const places = await listTrafficPlaces();
  return places.find((m) => m.slug === target) ?? null;
}

function trendFromYoy(yoy: number | null): Trend {
  if (yoy === null) return "stable";
  if (yoy > 2) return "up";
  if (yoy < -2) return "down";
  return "stable";
}

/**
 * Real market snapshot for a metro, computed from the warehouse:
 *   - typicalValue      = latest ZHVI
 *   - medianDaysOnMarket = latest median_dom
 *   - inventory         = latest inventory
 *   - yoyChangePct/trend = ZHVI now vs ~12 months earlier (from the monthly series)
 *
 * Returns an all-null snapshot (trend "stable") when the metro has no data, so
 * callers can render gracefully without fabricating anything.
 */
export async function getMetroSnapshot(
  geoLevel: PlaceLevel,
  geoCode: string,
): Promise<MetroSnapshot> {
  const empty: MetroSnapshot = {
    typicalValue: null,
    yoyChangePct: null,
    medianDaysOnMarket: null,
    inventory: null,
    trend: "stable",
    period: null,
  };
  if (!geoCode) return empty;

  const [latest, zhviSeries] = await Promise.all([
    getLatestMetrics(geoLevel, geoCode),
    getMetricSeries(geoLevel, geoCode, "zhvi", 13),
  ]);

  const byMetric = new Map(latest.map((m) => [m.metric, m]));
  const zhvi = byMetric.get("zhvi")?.value ?? null;
  const dom = byMetric.get("median_dom")?.value ?? null;
  const inventory = byMetric.get("inventory")?.value ?? null;
  const period =
    byMetric.get("zhvi")?.period ??
    byMetric.get("median_dom")?.period ??
    byMetric.get("inventory")?.period ??
    null;

  // YoY from the ZHVI series: newest vs the earliest point in the ~13-month
  // trailing window (≈ 12 months earlier). Requires both endpoints > 0.
  let yoyChangePct: number | null = null;
  const points = zhviSeries.filter((p) => typeof p.value === "number" && p.value! > 0);
  if (points.length >= 2) {
    const first = points[0].value as number;
    const last = points[points.length - 1].value as number;
    yoyChangePct = Math.round(((last - first) / first) * 1000) / 10; // 1 decimal
  }

  return {
    typicalValue: zhvi,
    yoyChangePct,
    medianDaysOnMarket: dom,
    inventory,
    trend: trendFromYoy(yoyChangePct),
    period,
  };
}

/**
 * Same-state, same-tier places nearest in size, for internal linking. A metro
 * links to nearby metros and a county to nearby counties (keeps the link set
 * coherent and the anchor text consistent).
 */
export async function getNearbyMetros(
  slug: string,
  limit = 4,
): Promise<TrafficMetro[]> {
  const places = await listTrafficPlaces();
  const base = places.find((m) => m.slug === slug);
  if (!base || !base.state) return [];
  return places
    .filter((m) => m.slug !== slug && m.state === base.state && m.geoLevel === base.geoLevel)
    .sort((a, b) => (a.sizeRank ?? 1e9) - (b.sizeRank ?? 1e9))
    .slice(0, limit);
}

/** Related page links across the three traffic surfaces for a metro slug. */
export function getRelatedMetroLinks(slug: string) {
  return [
    { href: `/home-value/${slug}`, label: "Home Value Page" },
    { href: `/sell-house/${slug}`, label: "Sell House Guide" },
    { href: `/market-report/${slug}`, label: "Market Report" },
  ];
}

/** Long-tail keyword pages for a metro (parameterized by its real city/state). */
export function getKeywordPagesForMetro(
  pageType: PageType,
  metro: TrafficMetro,
  limit = 20,
) {
  const keywords = buildLongTailKeywordSet(pageType, metro.city, metro.state).slice(0, limit);
  return keywords.map((keyword) => ({ keyword, keywordSlug: keywordToSlug(keyword) }));
}

export function resolveMetroKeyword(
  pageType: PageType,
  metro: TrafficMetro,
  keywordSlug: string,
): string {
  return (
    getKeywordPagesForMetro(pageType, metro).find((k) => k.keywordSlug === keywordSlug)?.keyword ?? ""
  );
}

export function isValidKeywordSlugForMetro(
  pageType: PageType,
  metro: TrafficMetro,
  keywordSlug: string,
): boolean {
  return getKeywordPagesForMetro(pageType, metro).some((k) => k.keywordSlug === keywordSlug);
}
