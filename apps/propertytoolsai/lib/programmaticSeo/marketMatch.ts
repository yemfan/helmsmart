import "server-only";

import type { ProgrammaticSeoLocation } from "./types";
import {
  getGeographyBySlug,
  listActiveGeographies,
  type ActiveGeography,
} from "@/lib/research/warehouse/read";
import { geoSlug, slugify, stateSlug } from "@/lib/research/warehouse/slug";

/**
 * Resolve a programmatic-SEO location (`{ slug, city, state }`) to a Data Center
 * warehouse geography so the `/tool/[toolSlug]/[locationSlug]` pages can inject a
 * REAL local-market snapshot and cross-link the Data Center.
 *
 * Match order: metro-first (city/state → active metro), then STATE fallback, then
 * null (unknown/inactive geography). Fully resilient — any failure returns null
 * so it never throws into the ISR page render.
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
 * in module scope via a memoized promise (survives across page renders in the
 * same server process; the DB is hit at most once per process).
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

export async function matchLocationToGeo(
  loc: ProgrammaticSeoLocation,
): Promise<MatchedGeo | null> {
  try {
    // 1) Metro-first: try the location slug, then a slug derived from city+state.
    const metroMap = await loadMetroSlugMap();
    const cityStateSlug = slugify(`${loc.city}, ${loc.state}`);
    const metro =
      metroMap.get(loc.slug) ?? metroMap.get(cityStateSlug) ?? null;

    if (metro) {
      const stSlug = stateSlug(metro.state || loc.state);
      const mSlug = geoSlug(metro);
      if (stSlug && mSlug) {
        return {
          geoLevel: "metro",
          geoCode: metro.geo_code,
          geoName: metro.geo_name,
          dataHref: `/data/markets/${stSlug}/${mSlug}`,
          stateCode: (metro.state || loc.state).toUpperCase(),
        };
      }
    }

    // 2) State fallback: resolve the active state page by its slug.
    const stSlug = stateSlug(loc.state);
    if (stSlug) {
      const state = await getGeographyBySlug("state", stSlug);
      if (state) {
        return {
          geoLevel: "state",
          geoCode: state.geo_code,
          geoName: state.geo_name,
          dataHref: `/data/markets/${stSlug}`,
          stateCode: state.geo_code.toUpperCase(),
        };
      }
    }

    // 3) Neither resolved.
    return null;
  } catch {
    return null;
  }
}
