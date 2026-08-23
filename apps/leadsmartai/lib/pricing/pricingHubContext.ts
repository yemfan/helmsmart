import type { CurrentUserWithRole } from "@/lib/auth/getCurrentUser";
import type { InternalPlan } from "@/lib/billing/stripe-plan-map";
import { BROKER_PORTAL_ROLES } from "@/lib/rolePortalPaths";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type PricingHubRole = "admin" | "agent" | "support" | "consumer";

/**
 * Snapshot for `/pricing/hub`: auth, coarse role, Stripe-backed plan, and product flags for UX.
 */
export type PricingHubContext = {
  loggedIn: boolean;
  role: PricingHubRole | null;
  /** `billing_subscriptions.plan` when status is active/trialing/past_due */
  billingPlan: string | null;
  entitlements: {
    /** Active `leadsmart_agent` row and/or `agent_starter` / `agent_pro` billing. */
    leadsmartAgent: boolean;
    /** `consumer_premium` subscription. */
    consumerPremium: boolean;
  };
};

export const emptyPricingHubContext: PricingHubContext = {
  loggedIn: false,
  role: null,
  billingPlan: null,
  entitlements: {
    leadsmartAgent: false,
    consumerPremium: false,
  },
};

/**
 * Maps `leadsmart_users.role` to a small set for pricing copy. Brokerage roles are treated as agent for hub.
 */
export function normalizePricingHubRole(role: string | null): PricingHubRole | null {
  const r = String(role ?? "").toLowerCase().trim();
  if (!r) return null;
  if (r === "user") return "consumer";
  if (r === "admin" || r === "support" || r === "agent" || r === "consumer") {
    return r;
  }
  if (BROKER_PORTAL_ROLES.has(r)) return "agent";
  return null;
}

export async function buildPricingHubContext(
  user: CurrentUserWithRole | null
): Promise<PricingHubContext> {
  if (!user) {
    return { ...emptyPricingHubContext };
  }

  const [billingRes, entRes] = await Promise.all([
    supabaseAdmin
      .from("billing_subscriptions")
      .select("plan, status")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing", "past_due"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("active_product_entitlements")
      .select("product")
      .eq("user_id", user.id),
  ]);

  if (billingRes.error) {
    throw new Error(billingRes.error.message);
  }
  if (entRes.error) {
    throw new Error(entRes.error.message);
  }

  const billingPlan = (billingRes.data?.plan as InternalPlan | undefined) ?? null;
  const products = new Set((entRes.data ?? []).map((e) => e.product));

  const consumerPremium = billingPlan === "consumer_premium";
  const leadsmartAgent =
    products.has("leadsmart_agent") ||
    billingPlan === "agent_starter" ||
    billingPlan === "agent_pro";

  return {
    loggedIn: true,
    role: normalizePricingHubRole(user.role),
    billingPlan,
    entitlements: {
      leadsmartAgent,
      consumerPremium,
    },
  };
}
