/**
 * Home Value Estimate — shared types for API + client.
 */

export type PropertyCondition = "poor" | "fair" | "average" | "good" | "excellent";
export type RenovationLevel = "none" | "cosmetic" | "major" | "full";
export type UserIntent = "seller" | "buyer" | "investor";

/** Inferred from behavioral signals (may be unknown when no signal fires). */
export type LikelyIntent = "seller" | "buyer" | "investor" | "unknown";

/**
 * Client + server signals for intent scoring.
 * All fields optional — absent means false / not observed.
 */
export type IntentSignals = {
  /** Ran a home value estimate (usually forced true server-side). */
  homeValueUsed?: boolean;
  fullReportUnlocked?: boolean;
  askedForCma?: boolean;
  expertHelpClicked?: boolean;
  revisitSameAddress?: boolean;
  listingLikeAddress?: boolean;
  mortgageAfterEstimate?: boolean;
  comparisonToolUsed?: boolean;
  rentOrRoiOrCapToolUsed?: boolean;
  comparesMultipleProperties?: boolean;
  priceVsValueFocus?: boolean;
};

/** Normalized property for estimation (warehouse + user overrides). Alias: structured address + facts. */
export type NormalizedProperty = {
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotSqft: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
  /** Fields we wanted but could not fill from enrichment */
  missingFields: string[];
};

/** Alias — autocomplete + enrichment output for API consumers */
export type NormalizedAddress = NormalizedProperty;

export type AdjustmentLine = {
  key: string;
  label: string;
  multiplier: number;
};

export type HomeValueEstimateOutput = {
  point: number;
  low: number;
  high: number;
  baselinePpsf: number;
  adjustments: AdjustmentLine[];
  summary: string;
};

export type ConfidenceLevel = "high" | "medium" | "low";

/** Four pillars (0–100 each) — matches the confidence engine weighted model. */
export type ConfidenceInputsSnapshot = {
  addressQuality: number;
  detailCompleteness: number;
  compCoverage: number;
  marketStability: number;
};

export type ConfidenceOutput = {
  level: ConfidenceLevel;
  /** 0–100 */
  score: number;
  bandPct: number;
  factors: { key: string; label: string; impact: number }[];
  /** Human-readable rationale for the level. */
  explanation: string;
  /** Resolved pillar scores (for UI/debug). */
  inputs?: ConfidenceInputsSnapshot;
};

export type ToolkitRecommendation = {
  title: string;
  href: string;
  reason: string;
  intent: UserIntent;
};

/** Client → API payload */
export type HomeValueEstimateRequest = {
  address: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** User refinements (optional) */
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  lotSqft?: number | null;
  yearBuilt?: number | null;
  propertyType?: string | null;
  condition?: PropertyCondition;
  renovation?: RenovationLevel;
  renovationYear?: number;
  renovationScope?: "full" | "partial" | "addition";
  renovationRooms?: string[];
  sqftAdded?: number;
  /** User-selected intent; omit for auto (signal-based inference). */
  intent?: UserIntent;
  /** Behavioral signals — combined with server hints for LikelyIntent. */
  intent_signals?: Partial<IntentSignals>;
  /** Force refresh of property ingestion */
  refresh?: boolean;
  /** Client funnel id (sessionStorage); used to upsert `home_value_sessions`. */
  session_id?: string;
};

/** API → client */
export type HomeValueEstimateResponse = {
  ok: true;
  normalizedProperty: NormalizedProperty;
  estimate: HomeValueEstimateOutput;
  confidence: ConfidenceOutput;
  market: {
    city: string;
    state: string;
    trend: "up" | "down" | "stable";
    medianPrice: number | null;
    pricePerSqft: number | null;
    source: string;
  };
  comps: {
    pricedCount: number;
    totalConsidered: number;
  };
  recommendations: ToolkitRecommendation[];
  /** Signal scores + inferred bucket (analytics / UI). */
  intentInference: {
    likely: LikelyIntent;
    scores: { seller: number; buyer: number; investor: number };
    rationale: string[];
    /** Recommendations + persistence use this (explicit user choice or inferred). */
    applied: UserIntent;
  };
  /** Echoed funnel id (server may assign if missing). */
  sessionId: string;
  /** Internal debug/provenance flags used by the API route (e.g. eligibility gate). */
  _debug?: {
    hasWarehouseRow?: boolean;
    hasRentcastSubject?: boolean;
  };
};
