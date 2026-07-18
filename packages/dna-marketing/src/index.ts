// @helm/dna-marketing — Marketing DNA: Campaign, Social, Reviews, Postcards, Nurture.
// Core package. MUST NOT import @helm/pack-* or apps/*. (enforced by scripts/check-boundaries.mjs)
// First extraction: pure campaign primitives (audience segmentation, tone presets, copy parsers).
export * from "./campaigns";
// Second extraction: social publishing — approval gate, cadence spread, platform
// capability, and the claim check that stops AI-written marketing from asserting
// features the business doesn't have. See ./social/index.ts for what is
// deliberately NOT here.
export * from "./social";
