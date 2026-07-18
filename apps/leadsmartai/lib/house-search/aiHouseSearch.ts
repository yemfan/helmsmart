import "server-only";

/**
 * AI House Search producer — now the shared `@repo/valuation` engine (Claude +
 * web_search). Kept as a thin re-export so existing `@/lib/house-search/aiHouseSearch`
 * imports keep working; the implementation lives in packages/valuation so both
 * apps (RealtyBoss + PropertyTools) share one engine.
 */
export { generateHouseSearch } from "@repo/valuation/server";
