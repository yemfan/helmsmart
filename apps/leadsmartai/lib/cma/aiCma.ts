/**
 * AI-grounded CMA producer — now sourced from the shared `@repo/valuation`
 * package so leadsmartai (RealtyBoss) and propertytoolsai share ONE valuation
 * engine (Claude + live web search). Re-exported here to keep existing
 * `@/lib/cma/aiCma` imports stable.
 *
 * The engine takes a `ValuationInput` ({ address, beds?, baths?, sqft?,
 * yearBuilt?, condition? }) and returns a `ValuationResult` — structurally
 * identical to the old `FetchSmartCmaInput` / `FetchSmartCmaResult`, so callers
 * (createCmaForAgent) are unaffected.
 */
export { generateAiCma, AI_CMA_DISCLAIMER } from "@repo/valuation/server";
