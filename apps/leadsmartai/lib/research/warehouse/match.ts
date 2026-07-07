import "server-only";

import { getGeographyBySlug, listActiveGeographies, type ActiveGeography } from "./read";
import { geoSlug, slugify, stateSlug } from "./slug";

/**
 * Resolve a contact's `{ city, state }` to a Data Center warehouse geography so
 * the "Send Market Report" flow can freeze a REAL local-market snapshot.
 *
 * Ported from apps/propertytoolsai/lib/programmaticSeo/marketMatch.ts:
 *   metro-first (city+state slug → active metro), then STATE fallback, then null.
 * Fully resilient — any failure returns null so the caller reports a clean
 * "no market data for that location" instead of throwing.
 */

export type MatchedGeo = {
  geoLevel: "metro" | "state";
  geoCode: string;
  geoName: string;
  /** Canonical Data Center path for this geography. */
  dataHref: string;
  /** 2-letter state code. */
  stateCode: string;
};

/**
 * Metro slug → geography map, built once from the active-metros list and cached
 * in module scope via a memoized promise (the DB is hit at most once per
 * process). Keyed by `geoSlug` (e.g. "los-angeles-ca").
 */
let metroSlugMapPromise: Promise<Map<string, ActiveGeography>> | null = null;

function loadMetroSlugMap(): Promise<Map<string, ActiveGeography>> {
  if (!metroSlugMapPromise) {
    metroSlugMapPromise = (async () => {
      const map = new Map<string, ActiveGeography>();
      try {
        const metros = await listActiveGeographies("metro");
        for (const m of metros) {
          const slug = geoSlug(m);
          if (slug && !map.has(slug)) map.set(slug, m);
        }
      } catch {
        // Leave the map empty; callers fall back to state / null.
      }
      return map;
    })();
  }
  return metroSlugMapPromise;
}

export async function matchCityStateToGeo(
  city: string,
  state: string,
): Promise<MatchedGeo | null> {
  const cityTrim = (city ?? "").trim();
  const stateTrim = (state ?? "").trim();
  if (!cityTrim || !stateTrim) return null;

  try {
    // 1) Metro-first: slug from "City, ST" → active metro.
    const metroMap = await loadMetroSlugMap();
    const cityStateSlug = slugify(`${cityTrim}, ${stateTrim}`);
    const metro = metroMap.get(cityStateSlug) ?? null;

    if (metro) {
      const stSlug = stateSlug(metro.state || stateTrim);
      const mSlug = geoSlug(metro);
      if (stSlug && mSlug) {
        return {
          geoLevel: "metro",
          geoCode: metro.geo_code,
          geoName: metro.geo_name,
          dataHref: `/data/markets/${stSlug}/${mSlug}`,
          stateCode: (metro.state || stateTrim).toUpperCase(),
        };
      }
    }

    // 2) State fallback: resolve the active state page by its slug.
    const stSlug = stateSlug(stateTrim);
    if (stSlug) {
      const stateGeo = await getGeographyBySlug("state", stSlug);
      if (stateGeo) {
        return {
          geoLevel: "state",
          geoCode: stateGeo.geo_code,
          geoName: stateGeo.geo_name,
          dataHref: `/data/markets/${stSlug}`,
          stateCode: stateGeo.geo_code.toUpperCase(),
        };
      }
    }

    // 3) Neither resolved.
    return null;
  } catch {
    return null;
  }
}
