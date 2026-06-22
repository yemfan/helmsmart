import "server-only";

import { getActiveAgentEntitlement } from "./getEntitlements";
import { planSlugToAgentPlan } from "./planCatalog";
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

/**
 * Resolve the active plan for an auth user and map it to a daily AI limit.
 *
 * Source of truth is product_entitlements. But that table can lag behind a
 * paid user's actual plan (e.g. a comp/admin-set "premium" with no synced
 * entitlement row), which would silently under-limit them to free. So when
 * there's no active entitlement, we fall back to leadsmart_users.plan —
 * but only honor a PAID tier when the subscription is active, so a lapsed
 * plan can't keep granting unlimited.
 */
export async function getAiTierLimitForUser(userId: string): Promise<AiTierLimit> {
  try {
    const ent = await getActiveAgentEntitlement(supabaseAdmin, userId);
    if (ent?.plan) {
      return { plan: ent.plan, limit: aiDailyLimitForPlan(ent.plan) };
    }

    // No active entitlement — fall back to the user row's plan.
    const { data } = await supabaseAdmin
      .from("leadsmart_users")
      .select("plan, subscription_status")
      .eq("user_id", userId)
      .maybeSingle();
    const row = (data ?? null) as { plan: string | null; subscription_status: string | null } | null;
    if (row && (row.subscription_status ?? "").toLowerCase() === "active") {
      const plan = planSlugToAgentPlan(row.plan);
      return { plan, limit: aiDailyLimitForPlan(plan) };
    }
  } catch (e) {
    console.warn("[aiTierLimit] plan read failed; treating as free:", e);
  }
  // Default: free tier.
  return { plan: null, limit: aiDailyLimitForPlan(null) };
}
