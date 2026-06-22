import "server-only";

import { PRODUCT_LEADSMART_AGENT } from "./product";
import { agentPlanToUserSlug, planRowFromCatalog, planSlugToAgentPlan } from "./planCatalog";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AgentPlan } from "./types";
import { grantReferralBonusIfPending } from "@/lib/referrals/service";

/**
 * Idempotently ensure a user has an active LeadSmart AI Agent entitlement
 * that MATCHES their leadsmart_users plan, plus a consistent "active" user
 * row.
 *
 * Why a general reconcile (not just "starter"): product_entitlements can
 * lag behind a paid user's actual plan — e.g. an admin/comp "premium" set
 * directly on leadsmart_users with no synced entitlement row. That user
 * would be treated as free by every entitlement-gated feature (quotas,
 * lead/contact caps, AI actions, alerts, team). So when a user has NO
 * active entitlement, we create one for their *actual* plan (paid plan
 * when the subscription is active; starter otherwise).
 *
 * Idempotent + safe:
 *   - If an active entitlement already exists, we DON'T touch it (the
 *     billing/Stripe sync owns plan changes) — we only sync the user row
 *     so the dashboard gate stops bouncing them.
 *   - If there's no active entitlement, we deactivate any stale rows and
 *     insert a fresh one built from the plan catalog.
 *
 * Returns true if state changed, false if already good.
 */
export async function reconcileEntitlement(
  userId: string,
): Promise<{ changed: boolean; reason: string }> {
  const now = new Date().toISOString();

  // Read both sides up front (this runs on every dashboard load, so the
  // happy path must avoid writes).
  const [{ data: activeRow }, { data: lu }] = await Promise.all([
    supabaseAdmin
      .from("product_entitlements")
      .select("id, plan")
      .eq("user_id", userId)
      .eq("product", PRODUCT_LEADSMART_AGENT)
      .eq("is_active", true)
      .maybeSingle(),
    supabaseAdmin
      .from("leadsmart_users")
      .select("plan, subscription_status")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const row = (lu ?? null) as { plan: string | null; subscription_status: string | null } | null;

  // 1. Active entitlement already exists — never override a paid
  // customer's synced plan. Only fix the user row if it's actually stale
  // (don't churn updated_at on every load).
  if (activeRow) {
    const desiredSlug = agentPlanToUserSlug((activeRow as { plan: string }).plan as AgentPlan);
    const stale =
      (row?.plan ?? "") !== desiredSlug ||
      String(row?.subscription_status ?? "").toLowerCase() !== "active";
    if (stale) {
      await syncUserRowToActive(userId, activeRow as { plan: string });
      return { changed: true, reason: "synced stale user row" };
    }
    return { changed: false, reason: "already consistent" };
  }

  // 2. No active entitlement — provision one for the user's ACTUAL plan.
  const subActive = ["active", "trialing"].includes(
    String(row?.subscription_status ?? "").toLowerCase(),
  );
  // Honor a paid tier only when the subscription is active; otherwise the
  // user falls to Starter (free) so they keep access without overpaying.
  const targetPlan = subActive ? planSlugToAgentPlan(row?.plan) : "starter";
  const catalog = planRowFromCatalog(targetPlan);

  // Deactivate any prior (inactive) rows, then insert the fresh entitlement.
  await supabaseAdmin
    .from("product_entitlements")
    .update({ is_active: false, updated_at: now })
    .eq("user_id", userId)
    .eq("product", PRODUCT_LEADSMART_AGENT);

  const { error: insertErr } = await supabaseAdmin
    .from("product_entitlements")
    .insert({
      user_id: userId,
      product: PRODUCT_LEADSMART_AGENT,
      plan: catalog.plan,
      is_active: true,
      cma_reports_per_day: catalog.cma_reports_per_day,
      max_leads: catalog.max_leads,
      max_contacts: catalog.max_contacts,
      alerts_level: catalog.alerts_level,
      reports_download_level: catalog.reports_download_level,
      team_access: catalog.team_access,
      ai_actions_per_month: catalog.ai_actions_per_month,
      source: "auto_reconcile_on_missing",
      starts_at: now,
      updated_at: now,
    });

  if (insertErr) {
    console.error("[reconcileEntitlement] insert failed:", insertErr);
    throw insertErr;
  }

  await syncUserRowToActive(userId, { plan: catalog.plan });

  // This is the moment a fresh user "becomes real" — credit any pending
  // referral now. Idempotent (bonus_granted_at guard); best-effort.
  try {
    await grantReferralBonusIfPending(userId);
  } catch (err) {
    console.warn(
      "[reconcileEntitlement] grantReferralBonusIfPending failed:",
      err instanceof Error ? err.message : err,
    );
  }

  return { changed: true, reason: `provisioned ${catalog.plan}` };
}

/**
 * @deprecated Prefer reconcileEntitlement. Kept as a name-compatible alias —
 * the reconcile already falls back to Starter when the sub isn't active.
 */
export const ensureStarterEntitlement = reconcileEntitlement;

/**
 * Keep `leadsmart_users.subscription_status` + `plan` consistent with the
 * chosen entitlement so the dashboard layout's gate stops bouncing them.
 */
async function syncUserRowToActive(
  userId: string,
  entitlement: { plan: string } | null,
): Promise<void> {
  // Write the leadsmart_users billing-slug dialect (free / pro / premium /
  // signature / team) — NOT the AgentPlan, or we'd corrupt the user row's
  // plan (e.g. "elite" where it expects "premium").
  const uiPlan = agentPlanToUserSlug((entitlement?.plan ?? "starter") as AgentPlan);
  await supabaseAdmin
    .from("leadsmart_users")
    .update({
      plan: uiPlan,
      subscription_status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}
