/**
 * Public home-value funnel API contract (`apps/propertytoolsai` lead-gen).
 * Kept in `shared` so mobile and CRM can type-check integrations without importing app code.
 */

export type PropertyCondition = "poor" | "fair" | "average" | "good" | "excellent";
export type RenovationLevel = "none" | "cosmetic" | "major" | "full";
export type UserIntent = "seller" | "buyer" | "investor";
export type LikelyIntent = "seller" | "buyer" | "investor" | "unknown";

export type IntentSignals = {
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
  missingFields: string[];
};

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

export type ConfidenceInputsSnapshot = {
  addressQuality: number;
  detailCompleteness: number;
  compCoverage: number;
  marketStability: number;
};

export type ConfidenceOutput = {
  level: ConfidenceLevel;
  score: number;
  bandPct: number;
  factors: { key: string; label: string; impact: number }[];
  explanation: string;
  inputs?: ConfidenceInputsSnapshot;
};

export type ToolkitRecommendation = {
  title: string;
  href: string;
  reason: string;
  intent: UserIntent;
};

/** Client → API (`apps/propertytoolsai` home value estimate). */
export type HomeValueEstimateRequest = {
  address: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  lat?: number | null;
  lng?: number | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  lotSqft?: number | null;
  yearBuilt?: number | null;
  propertyType?: string | null;
  condition?: PropertyCondition;
  renovation?: RenovationLevel;
  intent?: UserIntent;
  intent_signals?: Partial<IntentSignals>;
  refresh?: boolean;
  session_id?: string;
};

/** API → client success body. */
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
  intentInference: {
    likely: LikelyIntent;
    scores: { seller: number; buyer: number; investor: number };
    rationale: string[];
    applied: UserIntent;
  };
  sessionId: string;
  /** Rentcast comparable sales — fallback when local warehouse comps are unavailable. */
};
