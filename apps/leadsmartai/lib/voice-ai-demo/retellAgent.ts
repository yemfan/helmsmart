/**
 * Which Retell agent should place the demo call, and is it configured?
 *
 * The demo used to run the older Twilio Say/Gather loop while the product
 * moved to Retell, so prospects heard a turn-by-turn bot and then met a
 * different receptionist entirely. This picks the same agent their leads
 * reach, so the demo stops misrepresenting the thing it is selling.
 *
 * Per-language agents are supported but not required. One multilingual agent
 * is the current production setup and stays the default; a Chinese-specific
 * agent is used only if one is configured. That matters because Retell agent
 * settings (responsiveness, back-channel) are tuned in Retell's console, not
 * in this repo — a second agent is a second set of settings to keep in step,
 * and settings do not travel. Falling back means adding the env var is the
 * only step needed to split them, and removing it is the only step to merge
 * them back.
 *
 * Pure, so the selection and the config check can be tested without network.
 */

export type DemoLanguage = "en" | "zh";

export type RetellDemoEnv = {
  apiKey?: string;
  /** Number the demo dials FROM; must be registered in Retell. */
  fromNumber?: string;
  /** The agent the inbound receptionist uses. Always the fallback. */
  inboundAgentId?: string;
  /** Optional per-language overrides. */
  agentIdEn?: string;
  agentIdZh?: string;
};

export type RetellDemoConfig = {
  apiKey: string;
  fromNumber: string;
  agentId: string;
};

export type ConfigProblem =
  | "missing_api_key"
  | "missing_from_number"
  | "missing_agent_id";

/** Normalise whatever the form gave us to the two languages we run. */
export function demoLanguage(raw: string | null | undefined): DemoLanguage {
  return String(raw ?? "").toLowerCase().startsWith("zh") ? "zh" : "en";
}

/**
 * The agent for this language, falling back to the inbound receptionist.
 *
 * The fallback is the point: with no per-language agents configured, every
 * demo uses the one agent that is actually tuned.
 */
export function pickDemoAgentId(env: RetellDemoEnv, language: DemoLanguage): string {
  const specific = language === "zh" ? env.agentIdZh : env.agentIdEn;
  return (specific || "").trim() || (env.inboundAgentId || "").trim();
}

/**
 * @returns the config to call with, or the first thing that is missing — so
 *   the caller can say which environment variable to set rather than "failed".
 */
export function resolveRetellDemoConfig(
  env: RetellDemoEnv,
  language: DemoLanguage,
): { ok: true; config: RetellDemoConfig } | { ok: false; problem: ConfigProblem } {
  const apiKey = (env.apiKey || "").trim();
  if (!apiKey) return { ok: false, problem: "missing_api_key" };

  const fromNumber = (env.fromNumber || "").trim();
  if (!fromNumber) return { ok: false, problem: "missing_from_number" };

  const agentId = pickDemoAgentId(env, language);
  if (!agentId) return { ok: false, problem: "missing_agent_id" };

  return { ok: true, config: { apiKey, fromNumber, agentId } };
}

/** The environment variable a problem refers to, for the log line. */
export function envVarFor(problem: ConfigProblem): string {
  switch (problem) {
    case "missing_api_key":
      return "RETELL_API_KEY";
    case "missing_from_number":
      return "RETELL_DEMO_FROM_NUMBER";
    case "missing_agent_id":
      return "RETELL_INBOUND_AGENT_ID (or RETELL_DEMO_AGENT_ID_EN / _ZH)";
  }
}

/**
 * Variables handed to the agent for this call.
 *
 * `is_demo` lets the prompt acknowledge why it is calling. Without it the
 * receptionist would open as though the prospect had rung a listing, which is
 * the kind of small wrongness that makes a demo feel fake.
 */
export function demoDynamicVariables(args: {
  language: DemoLanguage;
  prospectName?: string | null;
}): Record<string, string> {
  return {
    is_demo: "true",
    language: args.language,
    caller_name: (args.prospectName || "").trim(),
  };
}
