import "server-only";
import { aiPropertyLookup } from "@repo/valuation/server";
import type { PropertyCore } from "./propertyService";

/**
 * Property data fetched for an address. Extends PropertyCore with the
 * listing-side fields the consumers of `/api/property/[address]` and
 * the warehouse snapshot data blob actually read off — most notably
 * the showings/new auto-fill flow which looks for `mlsNumber`,
 * `listingUrl`, and the listing-agent contact fields, and the
 * status banner which keys off `listing_status`.
 *
 * Source: **AI (Claude + web_search)** via `aiPropertyLookup` — replaced the
 * former RentCast `/v1/listings/sale` + `/v1/properties` calls. Every field the
 * AI can't verify on a real page comes back null / empty. NO fabricated values
 * — callers must treat an empty result as "no data" and surface the appropriate
 * empty state instead of acting on bogus numbers.
 *
 * This call is slow (~15-40s) and billable, so it's wrapped by
 * `getPropertyData` (180-day property_cache) — a cache hit never reaches here.
 */
export type PropertyFetchResult = PropertyCore & {
  listing_status: string | null;
  mlsNumber: string | null;
  mlsName: string | null;
  listingUrl: string | null;
  listingAgentName: string | null;
  listingAgentEmail: string | null;
  listingAgentPhone: string | null;
  year_built: number | null;
  lot_size: number | null;
  property_type: string | null;
  lat: number | null;
  lng: number | null;
};

function emptyResult(address: string): PropertyFetchResult {
  return {
    address,
    city: "",
    state: "",
    zip: "",
    beds: null,
    baths: null,
    sqft: null,
    price: null,
    rent: null,
    listing_status: null,
    mlsNumber: null,
    mlsName: null,
    listingUrl: null,
    listingAgentName: null,
    listingAgentEmail: null,
    listingAgentPhone: null,
    year_built: null,
    lot_size: null,
    property_type: null,
    lat: null,
    lng: null,
  };
}

/**
 * Zillow search-URL fallback for on-market listings when the AI didn't surface
 * a real listing page. Zillow auto-redirects to the homedetails page when the
 * address has a unique match, which is the common case. Returns null when the
 * property isn't currently for sale — no point sending the agent off-platform.
 */
function buildZillowFallbackUrl(address: string, status: string | null): string | null {
  if (!status) return null;
  if (!/^(active|pending)$/i.test(status.trim())) return null;
  const slug = address.trim().replace(/\s+/g, "-").replace(/,/g, "");
  if (!slug) return null;
  return `https://www.zillow.com/homes/${encodeURIComponent(slug)}_rb/`;
}

/**
 * Fetch property + listing facts for an address via AI (Claude + web_search).
 *
 * Returns:
 *   - Real data when the lookup finds the property.
 *   - `emptyResult(address)` when the AI can't find it, or when the lookup is
 *     unavailable (ANTHROPIC_API_KEY not set) — callers read this as "no data".
 *   NEVER throws for a "not found" — an empty result is a valid outcome.
 */
export async function fetchPropertyData(address: string): Promise<PropertyFetchResult> {
  const addr = (address ?? "").trim();
  if (!addr) return emptyResult(address);

  let result;
  try {
    result = await aiPropertyLookup(addr);
  } catch (e) {
    console.error("[fetchPropertyData] aiPropertyLookup threw:", e);
    return emptyResult(address);
  }

  if (!result.ok) {
    console.warn(`[fetchPropertyData] no data for "${addr}": ${result.error}`);
    return emptyResult(address);
  }

  const f = result.facts;
  return {
    address: addr,
    city: f.city ?? "",
    state: f.state ?? "",
    zip: f.zip ?? "",
    beds: f.beds,
    baths: f.baths,
    sqft: f.sqft,
    price: f.price,
    // Rent isn't part of a listing/record lookup — leave null (honest). Surfaces
    // that need a rent estimate should derive it separately.
    rent: null,
    listing_status: f.listingStatus,
    mlsNumber: f.mlsNumber,
    mlsName: f.mlsName,
    listingUrl: f.listingUrl ?? buildZillowFallbackUrl(addr, f.listingStatus),
    listingAgentName: f.listingAgentName,
    // The AI lookup does not surface agent contact details (rarely public) —
    // null, per the no-fabrication contract.
    listingAgentEmail: null,
    listingAgentPhone: null,
    year_built: f.yearBuilt,
    lot_size: f.lotSizeSqft,
    property_type: f.propertyType,
    lat: f.lat,
    lng: f.lng,
  };
}
