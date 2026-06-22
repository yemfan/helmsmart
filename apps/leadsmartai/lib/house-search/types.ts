/**
 * Types for AI House Search — a buyer-facing property search driven by a
 * natural-language query, grounded on Claude + live web search (NOT the
 * RentCast IDX adapter; see the team's "no RentCast" direction). Mirrors
 * the AI-grounded CMA pattern in lib/cma: real listings with cited source
 * URLs, never fabricated, plus a disclaimer.
 */

export type HouseListing = {
  address: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  propertyType: string | null;
  lotSizeSqft: number | null;
  hoaMonthly: number | null;
  yearBuilt: number | null;
  /** Listing page URL (Redfin / Realtor / Zillow / MLS) — the comp's source. */
  listingUrl: string | null;
  /** One-line "why this matches" the buyer's criteria. */
  matchReason: string | null;
};

/** A suggested way to narrow the search, surfaced as a checkbox option. */
export type SearchRefinement = {
  id: string;
  /** Human label shown next to the checkbox, e.g. "Single-family only". */
  label: string;
};

export type HouseSearchResult = {
  /** Plain-English restatement of how the query was understood. */
  interpreted: string;
  /** Bullet list of the concrete criteria parsed from the query. */
  criteria: string[];
  listings: HouseListing[];
  /** Suggested refinements the agent can check to narrow the next run. */
  refinements: SearchRefinement[];
  /** 2-4 sentence summary of what was found + caveats. */
  summary: string | null;
  sources: { title: string; url: string }[];
  disclaimer: string;
};

export const HOUSE_SEARCH_DISCLAIMER =
  "AI-generated results from public web data. Listings, prices, and availability may be out of date — verify each on its source site before sharing or relying on it.";
