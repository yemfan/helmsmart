/**
 * Pure types for the CMA (Comparative Market Analysis) feature.
 *
 * Mirrors the response shape of propertytoolsai's /api/smart-cma —
 * the upstream endpoint that owns the actual valuation engine + comp
 * pipeline. The leadsmartai CRM stores a snapshot of this response so
 * agents can retain, share, and re-show past CMAs without re-running
 * the engine.
 *
 * Don't add fields the upstream doesn't return — keep this file in
 * sync with propertytoolsai/app/api/smart-cma/route.ts. If the upstream
 * shape changes, version this file (CmaSnapshotV2) rather than migrating
 * stored JSON in-place; old reports stay readable in their original
 * shape.
 */

export type CmaCompRow = {
  address: string;
  price: number;
  sqft: number;
  beds: number | null;
  baths: number | null;
  distanceMiles: number;
  soldDate: string;
  propertyType: string | null;
  pricePerSqft: number;
  /** Lot size in square feet. Null/omitted when unknown or N/A (e.g. condos). */
  lotSizeSqft?: number | null;
  /** Monthly HOA dues in dollars. Null/omitted when none or unknown. */
  hoaMonthly?: number | null;
};

export type CmaSubject = {
  address: string;
  beds: number;
  baths: number;
  sqft: number;
  propertyType: string | null;
  yearBuilt: number;
  condition: string | null;
  /** Lot size in square feet. Null/omitted when unknown or N/A (e.g. condos). */
  lotSizeSqft?: number | null;
  /** Monthly HOA dues in dollars. Null/omitted when none or unknown. */
  hoaMonthly?: number | null;
};

export type CmaStrategy = {
  /** Below-market list price intended to drive multiple offers. */
  aggressive: number;
  /** Market-clearing price. */
  market: number;
  /** Stretch price for unique / scarce inventory. */
  premium: number;
  /** Projected days-on-market under each strategy. */
  daysOnMarket: {
    aggressive: number;
    market: number;
    premium: number;
  };
};

export type CmaValuation = {
  estimatedValue: number;
  low: number;
  high: number;
  avgPricePerSqft: number;
  /** 1-95 score from the upstream confidence engine. Optional — not
   *  every upstream response surfaces this directly today. */
  confidenceScore?: number | null;
};

/** A cited source the AI valuation drew a comp or market fact from. */
export type CmaSource = {
  title: string;
  url: string;
};

export type CmaSnapshot = {
  subject: CmaSubject;
  comps: CmaCompRow[];
  valuation: CmaValuation;
  strategies: CmaStrategy | null;
  /** Free-text engine summary, when present. */
  summary?: string | null;
  /**
   * How the snapshot was produced. "ai_web_search" = Claude grounded the
   * comps/value on live web search; "engine" = the legacy propertytoolsai
   * comps engine. Drives the disclaimer + source rendering.
   */
  valuationSource?: "ai_web_search" | "engine" | null;
  /** Cited sources backing the comps/value (AI valuations only). */
  sources?: CmaSource[];
  /** Shown verbatim on the report — e.g. the AI-estimate disclaimer. */
  disclaimer?: string | null;
};
