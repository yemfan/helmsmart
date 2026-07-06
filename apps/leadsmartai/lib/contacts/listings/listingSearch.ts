import "server-only";

import type { SavedSearchCriteria } from "@/lib/contacts/types";
import { generateHouseSearch } from "@/lib/house-search/aiHouseSearch";

/**
 * Active listings search backed by the AI house-search engine
 * (Claude Opus + live web_search) — NOT RentCast (see the team's
 * "no RentCast" direction). Translates a SavedSearchCriteria into a
 * natural-language buyer brief, runs the same grounded search the
 * buyer-facing House Search uses, and normalizes the results into the
 * small shape the recommender + digest email render.
 *
 * Consumers: contact recommendations (lib/contacts/recommendations/ai.ts)
 * and the saved-search-alerts cron (app/api/cron/saved-search-matcher).
 *
 * Caveats vs. the old RentCast adapter:
 *   - No listing photos (photoUrl is always null) — the AI engine
 *     doesn't return images. Renderers null-check photoUrl.
 *   - No structured city/state/zip — we best-effort parse them out of
 *     each listing's address string, falling back to the criteria's
 *     own city/state/zip so scoring still has values to match on.
 *   - No listedAt timestamp (null).
 *   - The search is slow (~30-60s, Opus + web search); callers must
 *     budget for it (route maxDuration = 60) and throttle it (the cron's
 *     alert_frequency + last_alerted_at gate bounds how often it runs).
 */

export type MatchedListing = {
  id: string;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  propertyType: string | null;
  listedAt: string | null;
  photoUrl: string | null;
};

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  single_family: "single-family",
  condo: "condo",
  townhouse: "townhouse",
  multi_family: "multi-family",
};

/**
 * Build a natural-language buyer brief from the structured criteria.
 * Omits absent fields. Returns null when there's nothing to search on
 * (so we never run an unbounded AI search).
 */
function criteriaToBrief(c: SavedSearchCriteria): string | null {
  const location: string[] = [];
  if (c.city) location.push(c.city);
  if (c.state) location.push(c.state);
  const locStr = location.join(", ");
  const withZip = c.zip ? `${locStr}${locStr ? " " : ""}${c.zip}`.trim() : locStr;

  const parts: string[] = [];
  if (withZip) parts.push(`Homes for sale in ${withZip}`);
  else parts.push("Homes for sale");

  const bedsMin = c.bedsMin;
  if (bedsMin && bedsMin > 0) parts.push(`${bedsMin}+ beds`);
  const bathsMin = c.bathsMin;
  if (bathsMin && bathsMin > 0) parts.push(`${bathsMin}+ baths`);

  if (c.priceMin && c.priceMax) {
    parts.push(`priced $${c.priceMin.toLocaleString()}-$${c.priceMax.toLocaleString()}`);
  } else if (c.priceMax) {
    parts.push(`priced under $${c.priceMax.toLocaleString()}`);
  } else if (c.priceMin) {
    parts.push(`priced over $${c.priceMin.toLocaleString()}`);
  }

  if (c.sqftMin && c.sqftMin > 0) parts.push(`at least ${c.sqftMin.toLocaleString()} sqft`);

  if (c.propertyType && c.propertyType !== "any") {
    parts.push(PROPERTY_TYPE_LABELS[c.propertyType] ?? c.propertyType);
  }

  // Nothing meaningful to constrain the search — bail so we don't run an
  // unbounded nationwide AI search. Require at least a location OR a
  // price/beds/baths/type/sqft filter beyond the default "Homes for sale".
  const hasSignal =
    !!withZip ||
    (!!bedsMin && bedsMin > 0) ||
    (!!bathsMin && bathsMin > 0) ||
    !!c.priceMin ||
    !!c.priceMax ||
    (!!c.sqftMin && c.sqftMin > 0) ||
    (!!c.propertyType && c.propertyType !== "any");
  if (!hasSignal) return null;

  return `${parts.join(", ")}.`;
}

/**
 * Best-effort parse of city/state/zip out of a free-form address string.
 * Addresses are typically "street, City, ST ZIP" (US). Falls back to the
 * criteria's own city/state/zip when the address doesn't yield them.
 */
function parseAddressParts(
  address: string,
  fallback: SavedSearchCriteria,
): { city: string | null; state: string | null; zip: string | null } {
  const zipMatch = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  const zip = zipMatch ? zipMatch[1] : fallback.zip ?? null;

  const stateMatch = address.match(/\b([A-Z]{2})\b(?=\s*\d{5}(?:-\d{4})?\b|\s*$)/);
  const state = stateMatch ? stateMatch[1] : fallback.state ?? null;

  // City is typically the comma-token just before the "ST ZIP" token.
  // For "123 Main St, Alhambra, CA 91801" that's "Alhambra".
  let city: string | null = null;
  const segments = address.split(",").map((s) => s.trim()).filter(Boolean);
  if (segments.length >= 2) {
    // The last segment usually holds "ST ZIP" (or just a ZIP); the one
    // before it is the city.
    const last = segments[segments.length - 1];
    const isStateZipTail = /^[A-Z]{2}\b/.test(last) || /^\d{5}(?:-\d{4})?$/.test(last);
    if (isStateZipTail && segments.length >= 2) {
      city = segments[segments.length - 2];
    } else {
      // No state/zip tail — treat the last comma-token as the city.
      city = last;
    }
  }
  if (!city) city = fallback.city ?? null;

  return { city, state, zip };
}

export async function findMatchingListings(
  criteria: SavedSearchCriteria,
): Promise<{ ok: true; listings: MatchedListing[] } | { ok: false; reason: string }> {
  const brief = criteriaToBrief(criteria);
  if (!brief) {
    return { ok: false, reason: "no_criteria" };
  }

  const result = await generateHouseSearch(brief);
  if (result.ok === false) {
    return { ok: false, reason: result.error };
  }

  const listings: MatchedListing[] = result.result.listings.map((l) => {
    const { city, state, zip } = parseAddressParts(l.address, criteria);
    return {
      // Stable dedup key: the specific listing URL if present, else the
      // lowercased address.
      id: l.listingUrl ?? l.address.toLowerCase(),
      address: l.address,
      city,
      state,
      zip,
      price: l.price,
      beds: l.beds,
      baths: l.baths,
      sqft: l.sqft,
      propertyType: l.propertyType,
      // The AI engine doesn't provide list dates or photos.
      listedAt: null,
      photoUrl: null,
    };
  });

  return { ok: true, listings };
}
