import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import {
  AGENT_DASHBOARD_HOME_PATH,
  START_FREE_AGENT_PATH,
  BROKER_PORTAL_ROLES,
  resolveRoleHomePath,
} from "@/lib/rolePortalPaths";
import type { UserPortalContext } from "@/lib/rolePortalServer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getActiveAgentEntitlement } from "./getEntitlements";

/**
 * Paid agent SKU on `billing_subscriptions` (Stripe-synced) — use when `product_entitlements`
 * row is missing or delayed but checkout already wrote billing.
 */
async function hasActivePaidAgentBilling(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .in("plan", ["agent_starter", "agent_pro"])
    .in("status", ["active", "trialing", "past_due"])
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[hasAgentWorkspaceAccess] billing_subscriptions check failed", error.message);
    return false;
  }
  return !!data;
}

/**
 * Workspace access: active `leadsmart_agent` entitlement OR active paid agent billing row OR platform admin.
 */
export async function hasAgentWorkspaceAccess(
  supabase: SupabaseClient,
  userId: string,
  role: string | null
): Promise<boolean> {
  const r = String(role ?? "").toLowerCase().trim();
  if (r === "admin") {
    return true;
  }
  const ent = await getActiveAgentEntitlement(supabase, userId);
  if (ent?.is_active === true) {
    return true;
  }
  return hasActivePaidAgentBilling(userId);
}

/**
 * `/agent/**` — requires active `leadsmart_agent` entitlement (or platform admin).
 * Other professional portals are routed to their home first.
 */
export async function ensureAgentWorkspaceAccess(
  supabase: SupabaseClient,
  ctx: UserPortalContext | null
): Promise<void> {
  const loginQs = new URLSearchParams({
    next: AGENT_DASHBOARD_HOME_PATH,
    redirect: AGENT_DASHBOARD_HOME_PATH,
  });

  if (!ctx) {
    redirect(`/login?${loginQs.toString()}`);
  }

  const r = String(ctx.role ?? "").toLowerCase().trim();
  if (BROKER_PORTAL_ROLES.has(r) || r === "support") {
    redirect(resolveRoleHomePath(ctx.role, ctx.hasAgentRow));
  }

  const ok = await hasAgentWorkspaceAccess(supabase, ctx.userId, ctx.role);
  if (!ok) {
    redirect(START_FREE_AGENT_PATH);
  }
}
