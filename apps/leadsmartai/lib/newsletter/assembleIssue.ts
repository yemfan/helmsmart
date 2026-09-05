import "server-only";

import {
  getGeographyBySlug,
  getLatestMetrics,
  listActiveGeographies,
  type ActiveGeography,
} from "@/lib/research/warehouse/read";
import { geoSlug, stateSlug } from "@/lib/research/warehouse/slug";
import { DEFAULT_LOCALE, resolveLocale } from "@leadsmart/i18n";

import { intlLocale } from "@/lib/i18n/locale";
import { translatorFor } from "@/lib/i18n/translator";
import {
  METRIC_META,
  findMetric,
  formatValue,
  formatPeriod,
  metricLabel,
  metricShort,
  isNum,
} from "@/lib/research/warehouse/format";
import type { GeoLevel } from "@/lib/research/warehouse/types";
import {
  getDigestForReader,
  getDigestForWeek,
  getLatestDigest,
  listRecentDigests,
  type NewsletterDigestRow,
} from "./db";

export {
  getLatestDigest,
  getDigestForWeek,
  getDigestForReader,
  listRecentDigests,
  type NewsletterDigestRow,
} from "./db";

/**
 * Issue assembly for the Weekly Regional Newsletter.
 *
 * An "issue" = the week's NATIONAL digest (from newsletter_digests) + a REGIONAL
 * market-data snapshot pulled live from the Data Center warehouse for the
 * resolved region. One national digest fans out across every region for a week;
 * only the regional snapshot changes per issue.
 *
 * A special "national" (also accepts "us") region slug produces the U.S.-wide
 * issue, whose snapshot reads the national warehouse geography (geo_code 'US').
 */

/** Headline metrics shown as stat tiles on the regional snapshot. */
const SNAPSHOT_METRICS = ["zhvi", "median_sale_price", "median_dom", "inventory"];

/** URL slugs that mean "the national (U.S.-wide) issue". */
const NATIONAL_SLUGS = new Set(["national", "us", "u-s", "united-states"]);

export type IssueStat = {
  metric: string;
  label: string;
  short: string;
  formatted: string;
  period: string;
  periodLabel: string;
};

export type IssueRegion = {
  name: string;
  level: GeoLevel;
  code: string;
  slug: string;
  /** 2-letter state code this region belongs to (for a state region it's the
   *  geo_code; for a metro it's the metro's state), else null (national). Drives
   *  regional ordering of digest items. */
  stateCode: string | null;
  /** Link to the region's Data Center page (deeper market data). */
  dataHref: string;
  stats: IssueStat[];
};

export type NewsletterIssue = {
  weekOf: string;
  digest: NewsletterDigestRow;
  region: IssueRegion;
};

/** Is this slug the national/U.S.-wide region? */
export function isNationalSlug(slug: string): boolean {
  return NATIONAL_SLUGS.has(slug.trim().toLowerCase());
}

/** Canonical slug for a region used in /newsletter/[region]/[week] URLs. */
export function regionSlugFor(level: GeoLevel, geo: ActiveGeography | null): string {
  if (level === "national" || !geo) return "national";
  return geoSlug(geo);
}

/** Data Center href for a resolved region. */
function dataHrefFor(level: GeoLevel, geo: ActiveGeography | null): string {
  if (level === "national" || !geo) return "/data/markets";
  if (geo.geo_level === "state") return `/data/markets/${geoSlug(geo)}`;
  // metro → /data/markets/<state>/<metro>
  const st = geo.state ? stateSlug(geo.state) : "";
  const metro = geoSlug(geo);
  return st && metro ? `/data/markets/${st}/${metro}` : "/data/markets";
}

/**
 * Re-label a region snapshot in the language the issue is actually written in.
 *
 * The stats are built English-first, because `resolveRegion` is also called on
 * its own (page metadata, the hub) where there is no issue and no language to
 * speak of. The issue does have one — and it is the DIGEST's, not the one the
 * reader asked for, because a week with no variant in their language falls
 * back to English and "中位成交价" over an English newsletter is a worse
 * answer than "Median sale price".
 *
 * Cheap enough to do after the fact: a handful of stats through pure lookups,
 * which keeps the region and the digest fetching in parallel.
 */
function localizeStats(region: IssueRegion, language: string): IssueRegion {
  if (resolveLocale(language) === DEFAULT_LOCALE) return region;
  const t = translatorFor(language, "dashboard");
  const tag = intlLocale(resolveLocale(language) ?? DEFAULT_LOCALE);
  return {
    ...region,
    stats: region.stats.map((st) => ({
      ...st,
      label: metricLabel(st.metric, t),
      short: metricShort(st.metric, t),
      periodLabel: formatPeriod(st.period, tag),
    })),
  };
}

async function buildStats(
  level: GeoLevel,
  code: string,
): Promise<IssueStat[]> {
  const metrics = await getLatestMetrics(level, code);
  const out: IssueStat[] = [];
  for (const key of SNAPSHOT_METRICS) {
    const m = findMetric(metrics, key);
    if (!m || !isNum(m.value)) continue;
    const meta = METRIC_META[key];
    const compact = m.unit === "usd" || m.unit === "index" || m.unit === "count";
    out.push({
      metric: key,
      label: meta?.label ?? key,
      short: meta?.short ?? key,
      formatted: formatValue(m.value, m.unit, { compact }),
      period: m.period,
      periodLabel: formatPeriod(m.period),
    });
  }
  return out;
}

/**
 * Resolve a region slug to an IssueRegion (name/level/code + stat tiles). Returns
 * null when the slug doesn't map to a tracked state/metro geography (national
 * always resolves).
 */
export async function resolveRegion(
  regionSlug: string,
): Promise<IssueRegion | null> {
  const slug = regionSlug.trim().toLowerCase();

  if (isNationalSlug(slug)) {
    const stats = await buildStats("national", "US");
    return {
      name: "United States",
      level: "national",
      code: "US",
      slug: "national",
      stateCode: null,
      dataHref: "/data/markets",
      stats,
    };
  }

  // Try state first, then metro. Both share the slug namespace conceptually, but
  // getGeographyBySlug matches within a level, so we probe each.
  let geo = await getGeographyBySlug("state", slug);
  let level: GeoLevel = "state";
  if (!geo) {
    geo = await getGeographyBySlug("metro", slug);
    level = "metro";
  }
  if (!geo) return null;

  const stats = await buildStats(level, geo.geo_code);
  // For a state region the geo_code IS the 2-letter code; for a metro, the
  // geo_code is an opaque Zillow RegionID, so use the metro's `state` field.
  const rawState = level === "state" ? geo.geo_code : geo.state;
  const stateCode =
    typeof rawState === "string" && /^[A-Za-z]{2}$/.test(rawState.trim())
      ? rawState.trim().toUpperCase()
      : null;
  return {
    name: geo.geo_name,
    level,
    code: geo.geo_code,
    slug: geoSlug(geo),
    stateCode,
    dataHref: dataHrefFor(level, geo),
    stats,
  };
}

/**
 * Resolve a subscription's stored (region_level, region_code) to the URL slug
 * that assembleIssue/resolveRegion expect. Subscriptions store the raw code
 * ('US' | a 2-letter state code | a Zillow metro RegionID), NOT a slug — this
 * bridges the two. Returns 'national' for the national level, the state slug for
 * a state, and (for a metro) the computed geoSlug after looking the metro up by
 * geo_code. Returns null when a metro code can't be matched to an active geo.
 */
export async function regionSlugForSubscription(
  regionLevel: string,
  regionCode: string,
): Promise<string | null> {
  const level = regionLevel.trim().toLowerCase();
  const code = regionCode.trim();

  if (level === "national") return "national";
  if (level === "state") {
    const slug = stateSlug(code);
    return slug || null;
  }
  if (level === "metro") {
    const metros = await listActiveGeographies("metro");
    const geo = metros.find((g) => g.geo_code === code);
    return geo ? geoSlug(geo) : null;
  }
  return null;
}

/**
 * Assemble one issue: the digest for `weekOf` in `language` + the region
 * snapshot for `regionSlug`. Returns null when either the region or the week
 * can't be resolved (page loaders should notFound()).
 *
 * `language` is the READER's — the visitor's locale on the web, the
 * subscriber's resolved preference in the send. It falls back to English when
 * that week has no variant in it, so a missing translation costs a reader
 * their language, never the issue.
 */
export async function assembleIssue(
  regionSlug: string,
  weekOf: string,
  language?: string | null,
): Promise<NewsletterIssue | null> {
  const [region, digest] = await Promise.all([
    resolveRegion(regionSlug),
    getDigestForReader(weekOf, language),
  ]);
  if (!region || !digest) return null;
  return {
    weekOf: digest.week_of,
    digest,
    region: localizeStats(region, digest.language),
  };
}

/**
 * Assemble the latest issue for a region (used by the hub's "read this week"
 * default). Returns null when there's no published digest or the region is
 * unknown.
 */
export async function assembleLatestIssue(
  regionSlug = "national",
  language?: string | null,
): Promise<NewsletterIssue | null> {
  // "Latest" is anchored to the DEFAULT locale's newest week, not the
  // reader's. Anchoring per-language would show a Chinese reader last week's
  // issue whenever this week's Chinese variant failed, with nothing saying so
  // — quietly stale beats loudly translated.
  const [region, anchor] = await Promise.all([
    resolveRegion(regionSlug),
    getLatestDigest(),
  ]);
  if (!region || !anchor) return null;
  const digest = await getDigestForReader(anchor.week_of, language);
  if (!digest) return null;
  return {
    weekOf: digest.week_of,
    digest,
    region: localizeStats(region, digest.language),
  };
}
