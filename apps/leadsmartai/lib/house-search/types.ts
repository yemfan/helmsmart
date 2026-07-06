/**
 * Types for AI House Search — now re-exported from the shared `@repo/valuation`
 * package (client-safe root entry) so both apps share one definition. Kept here
 * as a thin re-export so existing `@/lib/house-search/types` imports keep working.
 */
export { HOUSE_SEARCH_DISCLAIMER } from "@repo/valuation";
export type {
  HouseListing,
  SearchRefinement,
  HouseSearchResult,
} from "@repo/valuation";
