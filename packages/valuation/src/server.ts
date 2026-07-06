import "server-only";

/**
 * Server entry point for `@repo/valuation`. Pulls in the Claude + web_search
 * engine (server-only). Import types from `@repo/valuation` (the root entry)
 * in client code; import the engine from here in server code only.
 */
export { generateAiCma, AI_CMA_DISCLAIMER } from "./aiCma";
export {
  aiPropertyLookup,
  AI_PROPERTY_LOOKUP_DISCLAIMER,
  type PropertyFacts,
  type PropertyLookupResult,
  type PropertyListingStatus,
} from "./aiPropertyLookup";
export { generateHouseSearch } from "./aiHouseSearch";
export { getAnthropicClient, isAnthropicConfigured } from "./anthropic";
export * from "./types";
