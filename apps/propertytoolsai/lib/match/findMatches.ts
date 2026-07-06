import { generateHouseSearch } from "@repo/valuation/server";
import type { HouseListing } from "@repo/valuation";

import { paramsToBrief } from "@/lib/listings/brief";
import { parseAddressParts } from "@/lib/listings/aiListing";
import { calculateMatchScore } from "@/lib/match/engine";
import type { BuyerPreferences, MatchableListing, PropertyMatch } from "@/lib/match/types";

const MOCK_LISTINGS: MatchableListing[] = [
  {
    id: "mock-1",
    address: "123 Main St",
    city: "Pasadena",
    state: "CA",
    price: 800000,
    beds: 3,
    baths: 2,
    sqft: 1500,
    daysOnMarket: 5,
    propertyType: "single_family",
  },
  {
    id: "mock-2",
    address: "88 Oak Ave",
    city: "Pasadena",
    state: "CA",
    price: 850000,
    beds: 4,
    baths: 3,
    sqft: 1800,
    daysOnMarket: 40,
    propertyType: "single_family",
  },
];

/**
 * Map a shared-engine HouseListing onto the scoring engine's MatchableListing.
 * `id` is the external listing URL when present (else the address) so
 * downstream links can point at the real source; daysOnMarket/rentEstimate
 * aren't returned by the AI engine, so they stay undefined.
 */
function houseListingToMatchable(
  listing: HouseListing,
  fallback: { city: string; state: string; zip: string },
): MatchableListing {
  const parts = parseAddressParts(listing.address, fallback);
  return {
    id: (listing.listingUrl ?? listing.address).toLowerCase(),
    address: listing.address,
    city: parts.city,
    state: parts.state,
    price: listing.price ?? 0,
    beds: listing.beds ?? undefined,
    baths: listing.baths ?? undefined,
    sqft: listing.sqft ?? undefined,
    propertyType: listing.propertyType ?? undefined,
  };
}

export function parseMatchPreferences(body: unknown): BuyerPreferences | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const budget = Number(b.budget);
  if (!Number.isFinite(budget) || budget <= 0) return null;

  const beds = b.beds != null && b.beds !== "" ? Number(b.beds) : undefined;
  const baths = b.baths != null && b.baths !== "" ? Number(b.baths) : undefined;

  const lifestyle = b.lifestyle;
  const timeline = b.timeline;

  return {
    budget,
    city: typeof b.city === "string" ? b.city : undefined,
    state: typeof b.state === "string" ? b.state : "CA",
    beds: Number.isFinite(beds) && (beds as number) > 0 ? beds : undefined,
    baths: Number.isFinite(baths) && (baths as number) > 0 ? baths : undefined,
    lifestyle:
      lifestyle === "family" ||
      lifestyle === "investment" ||
      lifestyle === "commute" ||
      lifestyle === "luxury"
        ? lifestyle
        : undefined,
    timeline:
      timeline === "asap" || timeline === "3_months" || timeline === "6_months" ? timeline : undefined,
  };
}

export async function findPropertyMatches(prefs: BuyerPreferences): Promise<{
  matches: PropertyMatch[];
  provider: "live" | "mock";
}> {
  let listings: MatchableListing[] = [];
  let usedMock = false;

  const state = prefs.state || "CA";
  const fallback = { city: prefs.city ?? "", state, zip: "" };

  try {
    // Build a natural-language brief from the buyer's saved criteria and run
    // it through the shared AI house-search engine (Claude + web search).
    const brief =
      paramsToBrief({
        city: prefs.city ?? null,
        state,
        priceMin: Math.round(Math.max(50_000, prefs.budget * 0.35)),
        priceMax: Math.round(prefs.budget * 1.2),
        bedsMin: prefs.beds ?? null,
        bathsMin: prefs.baths ?? null,
      }) || `Homes for sale under $${Math.round(prefs.budget * 1.2).toLocaleString()}.`;

    const res = await generateHouseSearch(brief);
    if (res.ok === true) {
      listings = res.result.listings.map((l) => houseListingToMatchable(l, fallback));
    } else {
      usedMock = true;
      console.warn("[match] AI house search failed, using mock data:", res.error);
    }
  } catch (e) {
    usedMock = true;
    console.warn("[match] AI house search threw, using mock data:", e);
  }

  if (!listings.length) {
    listings = MOCK_LISTINGS;
    usedMock = true;
  }

  const matches = listings
    .map((p) => calculateMatchScore(prefs, p))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 24);

  return { matches, provider: usedMock ? "mock" : "live" };
}
