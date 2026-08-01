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
 * Warehouse-backed place provider for the programmatic traffic-SEO pages
 * (/home-value, /sell-house, /market-report).
 *
 * Replaces the hand-maintained TRAFFIC_CITIES list with the Data Center market
 * warehouse (market_geographies + market_metrics): ~305 metros, ~1,000 counties
 * and ~3,000 ZIPs, each carrying REAL, current figures (Zillow ZHVI, median days
 * on market, inventory) instead of hardcoded approximations.
 *
 * Slugs: metro = slugify(geo_name) ("los-angeles-ca"); county =
 * slugify(name)+"-"+state ("los-angeles-county-ca"); ZIP = the ZIP itself
 * ("77494"). All distinct, so they coexist in the same route space.
 *
 * All reads go through the service-role warehouse helpers (RLS-deny tables). If
 * the warehouse is unreachable, listTrafficMetros() falls back to the seed list
 * so the routes still exist (metric cards render empty — never fabricated).
 */

export type PlaceLevel = "metro" | "county" | "zip";

export type TrafficMetro = {
  /** URL slug — metro "los-angeles-ca"; county "los-angeles-county-ca"; zip "77494". */
  slug: string;
  /** Display name, e.g. "Los Angeles", "Los Angeles County", "77494 (Katy)". */
  city: string;
  /** 2-letter state code, e.g. "CA". */
  state: string;
  /** Full state name, e.g. "California". */
  stateName: string;
  /** Warehouse geo_code (Zillow RegionID for metro/county; the ZIP for zip). */
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

/**
 * Resolve `p`, but never wait longer than `ms` — fall back to `fallback` if it's
 * slow or errors. Static generation aborts a page after 60s; a single hung
 * warehouse read for one city must not take the whole build down (it did:
 * /home-value/san-diego-ca). The fallback here is an all-null snapshot, which the
 * pages render gracefully, and ISR backfills real figures at runtime (no 60s cap).
 */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

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
 * All active counties, largest-first. County names collide across states, so the
 * slug is slugify(geo_name)+"-"+state -> "los-angeles-county-ca". Distinct from
 * every metro slug. Empty if the warehouse has no county rows yet.
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
      city: g.geo_name,
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
 * All active ZIPs, largest-first. ZIP geo_code IS the ZIP ("77494") and geo_name
 * is its City ("Katy"), so slug = the ZIP and the display name reads "77494
 * (Katy)". ZIP slugs are numeric — no collision with metro/county slugs.
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
 * Real market snapshot for a place, computed from the warehouse:
 *   - typicalValue       = latest ZHVI
 *   - medianDaysOnMarket = latest median_dom
 *   - inventory          = latest inventory
 *   - yoyChangePct/trend = ZHVI now vs ~12 months earlier (from the monthly series)
 *
 * Returns an all-null snapshot (trend "stable") when the place has no data, so
 * callers render gracefully without fabricating anything.
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

  // Bound the warehouse reads: a slow city must not exceed the 60s per-page
  // static-generation limit and fail the whole build. On timeout we return the
  // empty snapshot (graceful) and ISR fills in real figures at runtime.
  const [latest, zhviSeries] = await withTimeout(
    Promise.all([
      getLatestMetrics(geoLevel, geoCode),
      getMetricSeries(geoLevel, geoCode, "zhvi", 13),
    ]),
    20_000,
    [[], []] as [
      Awaited<ReturnType<typeof getLatestMetrics>>,
      Awaited<ReturnType<typeof getMetricSeries>>,
    ],
  );

  const byMetric = new Map(latest.map((m) => [m.metric, m]));
  const zhvi = byMetric.get("zhvi")?.value ?? null;
  const dom = byMetric.get("median_dom")?.value ?? null;
  const inventory = byMetric.get("inventory")?.value ?? null;
  const period =
    byMetric.get("zhvi")?.period ??
    byMetric.get("median_dom")?.period ??
    byMetric.get("inventory")?.period ??
    null;

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

/** Same-state, same-tier places nearest in size, for internal linking. */
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

/** Long-tail keyword pages for a place (parameterized by its real city/state). */
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
