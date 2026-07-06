export type PropertySeoPhoto = {
  id: string;
  url: string;
  alt?: string;
};

export type PropertySeoComp = {
  id: string;
  address: string;
  soldPrice: number;
  soldDate: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  distanceMiles?: number;
};

export type NearbyListing = {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  photoUrl?: string;
  /** External source URL for the listing, when available. */
  listingUrl?: string;
};

export type PropertySeoRecord = {
  slug: string;
  fullAddress: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
  propertyType?: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  lotSize?: number;
  yearBuilt?: number;
  estimateValue?: number;
  estimateRangeLow?: number;
  estimateRangeHigh?: number;
  rentEstimate?: number;
  medianPpsf?: number;
  description?: string;
  photos: PropertySeoPhoto[];
  comps: PropertySeoComp[];
  nearbyListings: NearbyListing[];
  affordabilityExample?: {
    purchasePrice: number;
    estimatedMonthlyPayment: number;
    requiredIncome: number;
  };
  faq: Array<{
    question: string;
    answer: string;
  }>;
  neighborhoodLinks: Array<{
    label: string;
    href: string;
  }>;
};
