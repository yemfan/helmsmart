export type PropertyCondition = "poor" | "fair" | "good" | "excellent";

export type ConfidenceLabel = "low" | "medium" | "high";

export type PropertyType = "single_family" | "condo" | "townhome" | "multi_family";

import type { AddressSelection } from "@/lib/address/types";

export type EstimateUiState =
  | "idle"
  | "address_selected"
  | "estimating"
  | "preview_ready"
  | "refining"
  | "report_locked"
  | "unlocking"
  | "report_unlocked"
  | "error";

export type { AddressSelection };
export { parseTypedAddress, parseHomeValueAddressString } from "@/lib/address/types";

export type EstimateDetails = {
  propertyType?: PropertyType;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  lotSize?: number;
  condition?: PropertyCondition;
  renovation?: {
    done: boolean;
    year?: number;
    scope?: "full" | "partial" | "addition";
    rooms?: ("kitchen" | "bath" | "bedroom" | "other")[];
    sqftAdded?: number;
  };
};

export type EstimateRequest = {
  sessionId: string;
  address: AddressSelection;
  details: EstimateDetails;
  source?: string;
};

export type EstimateComp = {
  id: string;
  address: string;
  soldPrice: number;
  soldDate: string;
  pricePerSqft?: number;
  sqft?: number;
  beds?: number;
  baths?: number;
  distanceMiles: number;
  similarityScore: number;
  matchReasons?: string[];
  lat?: number;
  lng?: number;
};

export type EstimateResponse = {
  success: true;
  sessionId: string;
  property: {
    fullAddress: string;
    city?: string;
    state?: string;
    zip?: string;
    lat: number;
    lng: number;
    propertyType?: string;
    beds?: number;
    baths?: number;
    sqft?: number;
    yearBuilt?: number;
    lotSize?: number;
  };
  estimate: {
    value: number;
    rangeLow: number;
    rangeHigh: number;
    confidence: ConfidenceLabel;
    confidenceScore: number;
    summary: string;
  };
  supportingData: {
    medianPpsf: number;
    weightedPpsf?: number;
    localTrendPct?: number;
    compCount?: number;
    avgDaysOnMarket?: number;
  };
  adjustments?: Record<string, number>;
  comps: EstimateComp[];
  recommendations?: {
    type?: string;
  };
  provider?: {
    source: string;
    cached: boolean;
  };
};

export type UnlockReportResponse = {
  success: true;
  leadId: string;
  report: {
    estimate: {
      value: number;
      rangeLow: number;
      rangeHigh: number;
      confidence: ConfidenceLabel;
      confidenceScore: number;
    };
    market?: {
      medianPpsf?: number;
      localTrendPct?: number;
      compCount?: number;
      city?: string;
    };
    /**
     * `type` is the report's framing ("seller"). An `actions` string[] used to
     * sit beside it: every producer set it to [], and once the report started
     * rendering the real recommendation engine, nothing read it either.
     */
    recommendations?: {
      type?: string;
    };
    pdfUrl?: string;
  };
};

/**
 * Conceptual session payload for UI typing.
 * Production GET `/api/home-value/session` returns `{ ok: true, session }` with a DB row
 * (`full_address`, `session_id`, snake_case columns) — the hook maps that into {@link AddressSelection} / {@link EstimateDetails}.
 */
export type SessionResponse = {
  success: true;
  session: {
    sessionId: string;
    address: AddressSelection;
    details?: EstimateDetails;
    estimate?: EstimateResponse["estimate"];
  };
  comps?: EstimateComp[];
};

/** Reason why a property is ineligible for a valuation. */
export type IneligibleReason =
  | "ADDRESS_NOT_FOUND"
  | "NON_RESIDENTIAL"
  | "INSUFFICIENT_DATA"
  | "AMBIGUOUS_TYPE";

/** Info bundle returned by the API when an address is ineligible. */
export type IneligibleInfo = {
  reason: IneligibleReason;
  message: string;
  detail?: string;
  detectedType?: string;
};

export type LeadForm = {
  name: string;
  email: string;
  phone: string;
};

/** @deprecated Use {@link LeadForm} */
export type HomeValueUnlockReportInput = LeadForm;

export function formatCurrency(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function confidenceClasses(confidence?: ConfidenceLabel) {
  switch (confidence) {
    case "high":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "medium":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "low":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

/** @deprecated Use {@link formatCurrency} */
export const formatHomeValueCurrency = formatCurrency;

/** @deprecated Use {@link confidenceClasses} */
export const homeValueConfidenceClasses = confidenceClasses;
