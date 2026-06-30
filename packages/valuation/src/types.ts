/**
 * Pure types for AI-grounded valuation (Comparative Market Analysis +
 * home-value estimate). Client-safe — no server-only imports — so UI
 * components can import these shapes. The engine that produces them lives
 * in `@repo/valuation/server`.
 *
 * One source of truth shared by both apps:
 *   - apps/leadsmartai  (RealtyBoss CRM — agent CMAs)
 *   - apps/propertytoolsai (consumer home-value + AI CMA)
 *
 * Versioning: if the shape changes, add `CmaSnapshotV2` rather than mutating
 * this in place — stored JSON (cma_reports.snapshot_json, home_value_sessions)
 * must stay readable in its original shape.
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
  /** Year built. Null/omitted when unknown. */
  yearBuilt?: number | null;
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
  /**
   * URL of the subject's listing page (Redfin / Realtor / Zillow / MLS),
   * when the AI found the property online. Null when no listing page was
   * found. Consumers use it to pull a real listing photo.
   */
  listingUrl?: string | null;
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
  /** Integer 1-95 confidence. Optional — not always present. */
  confidenceScore?: number | null;
};

/**
 * A valuation is "credible" only if the estimate and the low/high band are all
 * real positive numbers. A failed AI run can yield $0 (or null) values that
 * must never reach a client-facing report or a "Send to seller" button.
 * Shared so the generator, the save path, and every render/share surface agree
 * on the exact same gate. Client-safe (no server imports).
 */
export function isCredibleCmaValuation(
  v: Pick<CmaValuation, "estimatedValue" | "low" | "high"> | null | undefined,
): boolean {
  if (!v) return false;
  const positive = (n: unknown): n is number =>
    typeof n === "number" && Number.isFinite(n) && n > 0;
  return positive(v.estimatedValue) && positive(v.low) && positive(v.high);
}

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
  /** Free-text summary, when present. */
  summary?: string | null;
  /**
   * How the snapshot was produced. "ai_web_search" = Claude grounded the
   * comps/value on live web search; "engine" = a legacy deterministic
   * comps engine. Drives the disclaimer + source rendering.
   */
  valuationSource?: "ai_web_search" | "engine" | null;
  /** Cited sources backing the comps/value (AI valuations only). */
  sources?: CmaSource[];
  /** Shown verbatim on the report — e.g. the AI-estimate disclaimer. */
  disclaimer?: string | null;
};

/**
 * Input to the AI valuation engine. `address` is the only required field;
 * the rest are known characteristics that improve the search when present.
 */
export type ValuationInput = {
  address: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  condition?: string;
};

export type ValuationResult =
  | { ok: true; snapshot: CmaSnapshot }
  | { ok: false; status: number; error: string };

/**
 * Narrowing predicate — `strict: false` callers don't narrow a discriminated
 * union on `!result.ok`, so this lets them reach `.status` / `.error`.
 */
export function isValuationFailure(
  r: ValuationResult,
): r is { ok: false; status: number; error: string } {
  return r.ok === false;
}
