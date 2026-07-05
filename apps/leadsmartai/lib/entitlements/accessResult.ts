import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { getAgentEntitlement } from "@/lib/entitlements/getEntitlements";
import { getTodayUsage } from "@/lib/entitlements/usage";
import type { AccessResult } from "@/lib/entitlements/types";

/**
 * User-scoped checks (RLS): pass `userId` only; uses the request Supabase server client.
 * Simpler than `limits.ts` (daily counters for leads/contacts vs live CRM counts in `limits.ts`).
 *
 * Import as `import { accessResult } from "@/lib/entitlements"` to avoid clashing with `agentAccess.hasAgentWorkspaceAccess`.
 */

export async function hasAgentWorkspaceAccess(userId: string): Promise<boolean> {
  const supabase = supabaseServerClient();
  const entitlement = await getAgentEntitlement(supabase, userId);
  return !!entitlement?.is_active;
}

export async function canCreateCma(userId: string): Promise<AccessResult> {
  const supabase = supabaseServerClient();
  const entitlement = await getAgentEntitlement(supabase, userId);
  if (!entitlement) {
    return {
      allowed: false,
      reason: "no_agent_entitlement",
      plan: null,
      currentUsage: null,
      limit: null,
    };
  }

  const usage = await getTodayUsage(supabase, userId);

  const current = usage?.cma_reports_used ?? 0;
  const limit = entitlement.cma_reports_per_day;

  if (limit !== null && current >= limit) {
    return {
      allowed: false,
      reason: "cma_limit_reached",
      plan: entitlement.plan,
      currentUsage: current,
      limit,
    };
  }

  return {
    allowed: true,
    reason: null,
    plan: entitlement.plan,
    currentUsage: current,
    limit,
  };
}

export async function canAddLead(userId: string): Promise<AccessResult> {
  const supabase = supabaseServerClient();
  const entitlement = await getAgentEntitlement(supabase, userId);
  if (!entitlement) {
    return {
      allowed: false,
      reason: "no_agent_entitlement",
      plan: null,
      currentUsage: null,
      limit: null,
    };
  }

  const usage = await getTodayUsage(supabase, userId);
  const current = usage?.leads_used ?? 0;
  const limit = entitlement.max_leads;

  if (limit !== null && current >= limit) {
    return {
      allowed: false,
      reason: "lead_limit_reached",
      plan: entitlement.plan,
      currentUsage: current,
      limit,
    };
  }

  return {
    allowed: true,
    reason: null,
    plan: entitlement.plan,
    currentUsage: current,
    limit,
  };
}

export async function canAddContact(userId: string): Promise<AccessResult> {
  const supabase = supabaseServerClient();
  const entitlement = await getAgentEntitlement(supabase, userId);
  if (!entitlement) {
    return {
      allowed: false,
      reason: "no_agent_entitlement",
      plan: null,
      currentUsage: null,
      limit: null,
    };
  }

  const usage = await getTodayUsage(supabase, userId);
  const current = usage?.contacts_used ?? 0;
  const limit = entitlement.max_contacts;

  if (limit !== null && current >= limit) {
    return {
      allowed: false,
      reason: "contact_limit_reached",
      plan: entitlement.plan,
      currentUsage: current,
      limit,
    };
  }

  return {
    allowed: true,
    reason: null,
    plan: entitlement.plan,
    currentUsage: current,
    limit,
  };
}

export async function canDownloadFullReport(userId: string): Promise<AccessResult> {
  const supabase = supabaseServerClient();
  const entitlement = await getAgentEntitlement(supabase, userId);
  if (!entitlement) {
    return {
      allowed: false,
      reason: "no_agent_entitlement",
      plan: null,
      currentUsage: null,
      limit: null,
    };
  }

  const level = entitlement.reports_download_level;
  const allowed = level === "full" || level === "unlimited";

  return {
    allowed,
    reason: allowed ? null : "download_limit_reached",
    plan: entitlement.plan,
    currentUsage: null,
    limit: null,
  };
}

export async function canUseAiAction(userId: string): Promise<AccessResult> {
  const supabase = supabaseServerClient();
  const entitlement = await getAgentEntitlement(supabase, userId);
  if (!entitlement) {
    return {
      allowed: false,
      reason: "no_agent_entitlement",
      plan: null,
      currentUsage: null,
      limit: null,
    };
  }

  // Check the bonus wallet first — referrals + promos deposit here.
  // Bonus tokens are consumed before the monthly plan quota, so they
  // actually extend the user's runway rather than silently filling
  // a cap they may never reach.
  const { data: userRow } = await supabase
    .from("leadsmart_users")
    .select("bonus_tokens")
    .eq("user_id", userId)
    .maybeSingle();
  const bonusTokens = ((userRow as { bonus_tokens?: number } | null)?.bonus_tokens) ?? 0;
  if (bonusTokens > 0) {
    return {
      allowed: true,
      reason: null,
      plan: entitlement.plan,
      currentUsage: 0,
      limit: null,
    };
  }

  const limit = entitlement.ai_actions_per_month;
  // NULL = unlimited (Premium, or legacy rows not yet backfilled).
  if (limit == null) {
    return {
      allowed: true,
      reason: null,
      plan: entitlement.plan,
      currentUsage: null,
      limit: null,
    };
  }

  // Sum the current-month usage from the rollup view.
  const monthStart = new Date().toISOString().slice(0, 7) + "-01";
  const { data } = await supabase
    .from("entitlement_ai_usage_monthly")
    .select("ai_actions_used")
    .eq("user_id", userId)
    .eq("month_start", monthStart)
    .maybeSingle();
  const current = (data as { ai_actions_used: number } | null)?.ai_actions_used ?? 0;

  if (current >= limit) {
    return {
      allowed: false,
      reason: "ai_usage_limit_reached",
      plan: entitlement.plan,
      currentUsage: current,
      limit,
    };
  }

  return {
    allowed: true,
    reason: null,
    plan: entitlement.plan,
    currentUsage: current,
    limit,
  };
}

export async function canInviteTeam(userId: string): Promise<AccessResult> {
  const supabase = supabaseServerClient();
  const entitlement = await getAgentEntitlement(supabase, userId);
  if (!entitlement) {
    return {
      allowed: false,
      reason: "no_agent_entitlement",
      plan: null,
      currentUsage: null,
      limit: null,
    };
  }

  return {
    allowed: entitlement.team_access,
    reason: entitlement.team_access ? null : "team_access_not_enabled",
    plan: entitlement.plan,
    currentUsage: null,
    limit: null,
  };
}
