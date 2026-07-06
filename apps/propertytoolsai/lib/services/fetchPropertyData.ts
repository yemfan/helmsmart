import "server-only";
import { aiPropertyLookup } from "@repo/valuation/server";
import type { PropertyCore } from "./propertyService";

/**
 * Property facts fetched for an address, used by `getPropertyData` to populate
 * the warehouse `properties` row + snapshot data blob.
 *
 * Source: **AI (Claude + web_search)** via `aiPropertyLookup` — replaced the
 * former RentCast `/v1/listings/sale` + `/v1/properties` warehouse ingest. Every
 * field the AI can't verify on a real page comes back null / empty. NO fabricated
 * values — a "not found" returns an all-null object and callers must treat that as
 * "no data" rather than acting on bogus numbers. (Previously this stub returned
 * hard-coded LA demo values that poisoned the warehouse; then an all-null stub
 * that starved every consumer. This restores real facts on cache miss.)
 *
 * Extends PropertyCore with the extra snake_case fields `getPropertyData` reads
 * off the result and writes to the warehouse row / snapshot: `year_built`,
 * `lot_size`, `property_type`, `lat`, `lng`, `listing_status`.
 *
 * This call is slow (~15-40s) and billable, so it's wrapped by
 * `getPropertyData` (180-day property_cache) — a cache hit never reaches here.
 */
export type PropertyFetchResult = PropertyCore & {
  year_built: number | null;
  lot_size: number | null;
  property_type: string | null;
  lat: number | null;
  lng: number | null;
  listing_status: string | null;
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
    year_built: null,
    lot_size: null,
    property_type: null,
    lat: null,
    lng: null,
    listing_status: null,
  };
}

/**
 * Fetch property facts for an address via AI (Claude + web_search).
 *
 * Returns:
 *   - Real facts when the lookup finds the property.
 *   - `emptyResult(address)` when the AI can't find it, or when the lookup is
 *     unavailable (ANTHROPIC_API_KEY not set) — callers read this as "no data".
 *   NEVER throws for a "not found" — an empty result is a valid outcome, and the
 *   all-null shape keeps the warehouse upsert clean (no fabricated numbers).
 */
export async function fetchPropertyData(
  address: string
): Promise<PropertyFetchResult> {
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
    // Rent isn't part of a facts/listing lookup — leave null (honest). Surfaces
    // that need a rent estimate must derive it separately.
    rent: null,
    year_built: f.yearBuilt,
    lot_size: f.lotSizeSqft,
    property_type: f.propertyType,
    lat: f.lat,
    lng: f.lng,
    listing_status: f.listingStatus,
  };
}
