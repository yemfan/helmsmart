// Social publishing core — the industry-agnostic half of "an AI writes our
// marketing and it goes out on a schedule".
//
// What lives here: the approval gate, the cadence spread, platform capability,
// the two-part claim check (deterministic screen + AI reviewer), the pure
// request builders, AND a dependency-free publish runtime (publishToAll) that
// drives those builders over an app-supplied ConnectionStore.
//
// What does NOT live here, deliberately:
//   - product FACTS (what a given business does)      -> per-tenant config
//   - competitor names                                 -> per-vertical config
//   - table names, ID shapes, tokens, encryption       -> the app owns its data
//     (it implements ConnectionStore over its own schema)
//   - model wiring                                     -> the app calls the LLM
//
// That line is the whole point: CloseBoss and HelmSmart have entirely
// different data layers (agents/contacts/scheduled_posts vs
// organizations/clients/social_posts, in separate databases), and MarketingBoss
// a third (users/social_connections), so the shareable asset is the JUDGEMENT
// and the plumbing-that-has-no-schema, not the data access.

export * from "./modes";
export * from "./schedule";
export * from "./platforms";
export * from "./claim-screen";
export * from "./claim-review";
export * from "./meta-graph";
export * from "./threads-graph";
// Runtime seam: interfaces (ConnectionStore, PostContent, …) + publishToAll.
export * from "./connections";
export * from "./publish";
