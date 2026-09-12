import type { MobileApiFailure } from "./closeBossMobileApi";

/**
 * Mobile mirror of `apps/leadsmartai/lib/entitlements/aiActionGate.ts`.
 *
 * The AI-action server routes (sms/ai-reply, email/ai-reply,
 * sales-model/sms/draft, etc.) return HTTP 402 with `code` =
 * `"no_agent_entitlement"` (no plan covers AI yet) or
 * `"ai_usage_limit_reached"` (this period's cap is exhausted).
 *
 * `mobilePost` already preserves the code on `MobileApiFailure`. This
 * helper centralizes the gate detection so React Native screens can:
 *   - swap a generic red error string for the upgrade banner
 *   - keep magic strings out of UI code
 *
 * No web-side `emit` equivalent here — mobile doesn't have a global
 * upgrade modal mounted; instead the `AiActionGateBanner` opens the
 * web billing page via `Linking`.
 */
export type AiActionGateReason =
  | "no_agent_entitlement"
  | "ai_usage_limit_reached";

export type AiActionGate = {
  reason: AiActionGateReason;
};

export function detectAiActionGate(failure: MobileApiFailure): AiActionGate | null {
  if (failure.status !== 402) return null;
  if (
    failure.code !== "no_agent_entitlement" &&
    failure.code !== "ai_usage_limit_reached"
  ) {
    return null;
  }
  return { reason: failure.code };
}
