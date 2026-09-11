// @helm/dna-communication — Communication DNA: unified voice/SMS/email/chat hub.
// First extraction: channel-agnostic messaging compliance/safety (opt-out + escalation),
// shared by leadsmartai (agent_id) and apps/helmsmart (org_id) — proving a Core module
// can serve two apps with different tenancy. Pure; no deps.
//
// Core package: MUST NOT import @helm/pack-* or apps/*.
export * from "./safety";
export * from "./consent";
