import "server-only";

import { getActiveAgentEntitlement } from "./getEntitlements";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AgentPlan } from "./types";

/**
 * Daily limit for the paid AI-generation features (CMA, House Search) by
 * subscription tier. These features each cost real Claude tokens + live
 * web searches, so they share one tiering policy:
 *
 *   Free  (starter / none)            → 1 per day
 *   Pro   (growth)                    → 10 per day
 *   Higher (elite / signature / team) → unlimited
 *
 * Returns null for "unlimited". Each feature counts its own usage, so a
 * free agent gets 1 CMA *and* 1 House Search per day.
 */
export function aiDailyLimitForPlan(plan: AgentPlan | null): number | null {
  switch (plan) {
    case "growth":
      return 10; // "Pro"
    case "elite":
    case "signature":
    case "team":
      return null; // unlimited
    case "starter":
    default:
      return 1; // free / unknown / no entitlement
  }
}

export type AiTierLimit = {
  plan: AgentPlan | null;
  /** null = unlimited. */
  limit: number | null;
};

/** Resolve the active plan for an auth user and map it to a daily AI limit. */
export async function getAiTierLimitForUser(userId: string): Promise<AiTierLimit> {
  let plan: AgentPlan | null = null;
  try {
    const ent = await getActiveAgentEntitlement(supabaseAdmin, userId);
    plan = ent?.plan ?? null;
  } catch (e) {
    console.warn("[aiTierLimit] entitlement read failed; treating as free:", e);
    plan = null;
  }
  return { plan, limit: aiDailyLimitForPlan(plan) };
}
