import "server-only";

/**
 * Model configuration for the Boss agent loop (HANDOFF_BOSS_V2 §1.3).
 *
 * Every agent-loop / tool-loop call reads the model from here — never hardcode
 * a model string at a call site. `BOSS_AGENT_MODEL` env overrides for rollouts
 * and incident fallback without a deploy.
 */
export const BOSS_AGENT_MODEL = process.env.BOSS_AGENT_MODEL || "claude-sonnet-4-6";

/**
 * Post-run memory extraction (lib/boss/memory/extract.ts) — a short, cheap
 * call per completed mission that decides whether anything is worth keeping.
 * Small model by default; override for rollouts the same way as above.
 */
export const BOSS_MEMORY_MODEL = process.env.BOSS_MEMORY_MODEL || "claude-haiku-4-5-20251001";
