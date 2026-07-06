import type { HouseListing } from "@repo/valuation";

import type { ListingResult } from "@/lib/listings/adapters/types";

/**
 * Map a shared-engine `HouseListing` (from `generateHouseSearch`) onto the
 * legacy `ListingResult` UI contract the consumer search surface renders.
 *
 * - `id` is the external listing URL when present, else the lowercased address
 *   (stable within a result set; used only as a React key / favorite id now
 *   that listings link externally).
 * - `city`/`state`/`zip` are parsed from the address, falling back to the
 *   caller's query params (the engine returns a single freeform address).
 * - `listingUrl` carries the external source URL so cards can link out.
 * - `photoUrl` is intentionally undefined — the AI engine returns no imagery.
 */

type AddressParts = { city: string; state: string; zip: string };

/**
 * Best-effort parse of "…, City, ST 90210" tail from a freeform address.
 * Anything we can't confidently extract falls back to the provided defaults.
 */
export function parseAddressParts(address: string, fallback: AddressParts): AddressParts {
  const result: AddressParts = { ...fallback };
  const zipMatch = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (zipMatch) result.zip = zipMatch[1];

  // Look for ", City, ST" (2-letter state) near the end.
  const cityStateMatch = address.match(/,\s*([^,]+?),\s*([A-Za-z]{2})\b/);
  if (cityStateMatch) {
    const city = cityStateMatch[1].trim();
    const state = cityStateMatch[2].trim().toUpperCase();
    if (city) result.city = city;
    if (state) result.state = state;
  }
  return result;
}

export function houseListingToResult(
  listing: HouseListing,
  fallback: AddressParts,
): ListingResult {
  const parts = parseAddressParts(listing.address, fallback);
  const id = (listing.listingUrl ?? listing.address).toLowerCase();
  return {
    id,
    address: listing.address,
    city: parts.city,
    state: parts.state,
    zip: parts.zip,
    price: listing.price ?? 0,
    beds: listing.beds ?? undefined,
    baths: listing.baths ?? undefined,
    sqft: listing.sqft ?? undefined,
    lotSize: listing.lotSizeSqft ?? undefined,
    yearBuilt: listing.yearBuilt ?? undefined,
    propertyType: listing.propertyType ?? undefined,
    photoUrl: undefined,
    provider: "ai_house_search",
    listingUrl: listing.listingUrl ?? undefined,
  };
}
