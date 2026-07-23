// Social publishing core — the industry-agnostic half of "an AI writes our
// marketing and it goes out on a schedule".
//
// What lives here: the approval gate, the cadence spread, platform capability,
// and the two-part claim check (deterministic screen + AI reviewer).
//
// What does NOT live here, deliberately:
//   - product FACTS (what a given business does)      -> per-tenant config
//   - competitor names                                 -> per-vertical config
//   - table names, ID shapes, tokens, publishers       -> the app owns its data
//   - model wiring                                     -> the app calls the LLM
//
// That line is the whole point: CloseBoss and HelmSmart have entirely
// different data layers (agents/contacts/scheduled_posts vs
// organizations/clients/social_posts, in separate databases), so the shareable
// asset is the JUDGEMENT, not the plumbing.

export * from "./modes";
export * from "./schedule";
export * from "./platforms";
export * from "./claim-screen";
export * from "./claim-review";
export * from "./meta-graph";
export * from "./threads-graph";
