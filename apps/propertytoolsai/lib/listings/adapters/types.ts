export type ListingSearchInput = {
  maxPrice?: number;
  minPrice?: number;
  zip?: string;
  city?: string;
  state?: string;
  propertyType?: "single_family" | "condo" | "townhome" | "multi_family";
  beds?: number;
  baths?: number;
  limit?: number;
};

export type ListingResult = {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
  price: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  lotSize?: number;
  yearBuilt?: number;
  propertyType?: string;
  status?: string;
  daysOnMarket?: number;
  listingAgentName?: string;
  listingAgentPhone?: string;
  listingAgentEmail?: string;
  photoUrl?: string;
  photos?: string[];
  mlsNumber?: string;
  description?: string;
  provider?: string;
  /**
   * External source URL for the listing (Redfin / Realtor / Zillow / MLS).
   * AI-sourced listings link out here instead of to an internal PDP. Absent
   * on legacy rows (e.g. old RentCast-id favorites), which render as plain
   * text rather than a broken internal link.
   */
  listingUrl?: string;
};

export interface ListingsAdapter {
  name: string;
  searchHomes(input: ListingSearchInput): Promise<ListingResult[]>;
  getListing(id: string): Promise<ListingResult | null>;
}
