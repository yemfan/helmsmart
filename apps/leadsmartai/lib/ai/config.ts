import "server-only";

/**
 * Model configuration for the Boss agent loop (HANDOFF_BOSS_V2 §1.3).
 *
 * Every agent-loop / tool-loop call reads the model from here — never hardcode
 * a model string at a call site. `BOSS_AGENT_MODEL` env overrides for rollouts
 * and incident fallback without a deploy.
 */
export const BOSS_AGENT_MODEL = process.env.BOSS_AGENT_MODEL || "claude-sonnet-4-6";
