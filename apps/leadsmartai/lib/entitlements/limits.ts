import type { SupabaseClient } from "@supabase/supabase-js";
import { PRODUCT_LEADSMART_AGENT } from "./product";
import { getActiveAgentEntitlement } from "./getEntitlements";
import {
  countContactsForAgent,
  countLeadsForAgent,
  getAgentNumericId,
  getTodayUsage,
} from "./usage";
import { PLAN_CATALOG } from "./planCatalog";
import type { AgentPlan, EntitlementCheckResult, LimitReason } from "./types";

/** Negative = unlimited (legacy rows); NULL = unlimited (DB convention for Premium). */
export function isUnlimitedLeadOrContactCap(n: number | null | undefined): boolean {
  if (n == null) return true;
  return typeof n === "number" && n < 0;
}

/** CMA cap: null or negative = unlimited / unset */
export function isUnlimitedCap(n: number | null | undefined): boolean {
  if (n == null) return true;
  return typeof n === "number" && n < 0;
}

export async function canCreateCma(
  supabase: SupabaseClient,
  userId: string
): Promise<EntitlementCheckResult> {
  const ent = await getActiveAgentEntitlement(supabase, userId);
  if (!ent) {
    return {
      allowed: false,
      reason: "No active LeadSmart AI Agent entitlement.",
      reasonCode: "no_agent_entitlement",
      plan: null,
      product: PRODUCT_LEADSMART_AGENT,
      currentUsage: {},
      limit: null,
    };
  }
  const cap = ent.cma_reports_per_day;
  if (isUnlimitedCap(cap)) {
    return {
      allowed: true,
      reason: null,
      reasonCode: null,
      plan: ent.plan,
      product: ent.product,
      currentUsage: { cmaToday: 0 },
      limit: null,
    };
  }
  const today = await getTodayUsage(supabase, userId);
  const used = today?.cma_reports_used ?? 0;
  const allowed = cap != null && used < cap;
  return {
    allowed,
    reason: allowed
      ? null
      : `You’ve used all CMA reports for today (${used}/${cap}). Upgrade to unlock more daily reports.`,
    reasonCode: allowed ? null : ("cma_limit_reached" satisfies LimitReason),
    plan: ent.plan,
    product: ent.product,
    currentUsage: { cmaToday: used },
    limit: cap,
  };
}

export async function canAddLead(
  supabase: SupabaseClient,
  userId: string
): Promise<EntitlementCheckResult> {
  const ent = await getActiveAgentEntitlement(supabase, userId);
  if (!ent) {
    return {
      allowed: false,
      reason: "No active LeadSmart AI Agent entitlement.",
      reasonCode: "no_agent_entitlement",
      plan: null,
      product: PRODUCT_LEADSMART_AGENT,
      currentUsage: {},
      limit: null,
    };
  }
  const cap = ent.max_leads;
  const agentId = await getAgentNumericId(supabase, userId);
  const used = agentId ? await countLeadsForAgent(supabase, agentId) : 0;
  if (isUnlimitedLeadOrContactCap(cap)) {
    return {
      allowed: true,
      reason: null,
      reasonCode: null,
      plan: ent.plan,
      product: ent.product,
      currentUsage: { leads: used },
      limit: null,
    };
  }
  const allowed = cap != null && used < cap;
  return {
    allowed,
    reason: allowed
      ? null
      : `You’ve reached your ${formatPlanLabel(ent.plan)} lead limit (${used}/${cap}). Upgrade to Pro to manage up to 500 leads.`,
    reasonCode: allowed ? null : ("lead_limit_reached" satisfies LimitReason),
    plan: ent.plan,
    product: ent.product,
    currentUsage: { leads: used },
    limit: cap,
  };
}

export async function canAddContact(
  supabase: SupabaseClient,
  userId: string
): Promise<EntitlementCheckResult> {
  const ent = await getActiveAgentEntitlement(supabase, userId);
  if (!ent) {
    return {
      allowed: false,
      reason: "No active LeadSmart AI Agent entitlement.",
      reasonCode: "no_agent_entitlement",
      plan: null,
      product: PRODUCT_LEADSMART_AGENT,
      currentUsage: {},
      limit: null,
    };
  }
  const cap = ent.max_contacts;
  const agentId = await getAgentNumericId(supabase, userId);
  const used = agentId ? await countContactsForAgent(supabase, agentId) : 0;
  if (isUnlimitedLeadOrContactCap(cap)) {
    return {
      allowed: true,
      reason: null,
      reasonCode: null,
      plan: ent.plan,
      product: ent.product,
      currentUsage: { contacts: used },
      limit: null,
    };
  }
  const allowed = cap != null && used < cap;
  return {
    allowed,
    reason: allowed
      ? null
      : `You’ve reached your contact limit (${used}/${cap}) on ${formatPlanLabel(ent.plan)}. Upgrade for a higher cap.`,
    reasonCode: allowed ? null : ("contact_limit_reached" satisfies LimitReason),
    plan: ent.plan,
    product: ent.product,
    currentUsage: { contacts: used },
    limit: cap,
  };
}

export async function canDownloadFullReport(
  supabase: SupabaseClient,
  userId: string
): Promise<EntitlementCheckResult> {
  const ent = await getActiveAgentEntitlement(supabase, userId);
  if (!ent) {
    return {
      allowed: false,
      reason: "No active LeadSmart AI Agent entitlement.",
      reasonCode: "no_agent_entitlement",
      plan: null,
      product: PRODUCT_LEADSMART_AGENT,
      currentUsage: {},
      limit: null,
    };
  }
  const level = String(ent.reports_download_level ?? "").toLowerCase();
  const today = await getTodayUsage(supabase, userId);
  const used = today?.report_downloads_used ?? 0;

  if (level === "limited") {
    const cap = 3;
    const allowed = used < cap;
    return {
      allowed,
      reason: allowed
        ? null
        : "You’ve reached your daily report download limit on Starter. Upgrade to Pro for full exports.",
      reasonCode: allowed ? null : ("download_limit_reached" satisfies LimitReason),
      plan: ent.plan,
      product: ent.product,
      currentUsage: { reportDownloadsToday: used },
      limit: cap,
    };
  }

  if (level === "full" || level === "unlimited") {
    return {
      allowed: true,
      reason: null,
      reasonCode: null,
      plan: ent.plan,
      product: ent.product,
      currentUsage: { reportDownloadsToday: used },
      limit: null,
    };
  }

  return {
    allowed: false,
    reason: "Report downloads are not enabled on your current plan.",
    reasonCode: null,
    plan: ent.plan,
    product: ent.product,
    currentUsage: { reportDownloadsToday: used },
    limit: 0,
  };
}

export async function canUseAiAction(
  supabase: SupabaseClient,
  userId: string,
): Promise<EntitlementCheckResult> {
  const ent = await getActiveAgentEntitlement(supabase, userId);
  if (!ent) {
    return {
      allowed: false,
      reason: "No active LeadSmart AI Agent entitlement.",
      reasonCode: "no_agent_entitlement",
      plan: null,
      product: PRODUCT_LEADSMART_AGENT,
      currentUsage: {},
      limit: null,
    };
  }
  const cap = ent.ai_actions_per_month;
  const used = await getAiActionsUsedThisMonth(supabase, userId);

  // NULL cap = unlimited (Premium, or legacy rows before migration).
  if (cap == null) {
    return {
      allowed: true,
      reason: null,
      reasonCode: null,
      plan: ent.plan,
      product: ent.product,
      currentUsage: { aiActionsThisMonth: used },
      limit: null,
    };
  }

  const allowed = used < cap;
  return {
    allowed,
    reason: allowed
      ? null
      : `You've used all ${cap} AI actions for the month on ${formatPlanLabel(ent.plan)}. Upgrade to Pro for 500 per month or Premium for unlimited.`,
    reasonCode: allowed ? null : ("ai_usage_limit_reached" satisfies LimitReason),
    plan: ent.plan,
    product: ent.product,
    currentUsage: { aiActionsThisMonth: used },
    limit: cap,
  };
}

export async function canPlaceVoiceCall(
  supabase: SupabaseClient,
  userId: string,
): Promise<EntitlementCheckResult> {
  const ent = await getActiveAgentEntitlement(supabase, userId);
  if (!ent) {
    return {
      allowed: false,
      reason: "No active LeadSmart AI Agent entitlement.",
      reasonCode: "no_agent_entitlement",
      plan: null,
      product: PRODUCT_LEADSMART_AGENT,
      currentUsage: {},
      limit: null,
    };
  }
  const cap = ent.voice_minutes_per_month;
  const used = await getVoiceMinutesUsedThisMonth(supabase, userId);

  // NULL cap = unlimited (Premium / Signature / Team, or legacy rows).
  if (cap == null) {
    return {
      allowed: true,
      reason: null,
      reasonCode: null,
      plan: ent.plan,
      product: ent.product,
      currentUsage: { voiceMinutesThisMonth: used },
      limit: null,
    };
  }

  // Within the included allotment.
  if (used < cap) {
    return {
      allowed: true,
      reason: null,
      reasonCode: null,
      plan: ent.plan,
      product: ent.product,
      currentUsage: { voiceMinutesThisMonth: used },
      limit: cap,
    };
  }

  // At/over the cap. Paid tiers keep calling and bill overage
  // (VOICE_OVERAGE_RATE_USD/min); the free Starter hard-stops.
  const overageMinutes = used - cap;
  if (PLAN_CATALOG[ent.plan]?.allowsVoiceOverage) {
    return {
      allowed: true,
      reason: null,
      reasonCode: null,
      plan: ent.plan,
      product: ent.product,
      currentUsage: { voiceMinutesThisMonth: used, voiceOverageMinutes: overageMinutes },
      limit: cap,
    };
  }
  return {
    allowed: false,
    reason: `You've used all ${cap} AI voice minutes this month on ${formatPlanLabel(ent.plan)}. Upgrade to Pro for more minutes.`,
    reasonCode: "voice_minutes_limit_reached" satisfies LimitReason,
    plan: ent.plan,
    product: ent.product,
    currentUsage: { voiceMinutesThisMonth: used, voiceOverageMinutes: overageMinutes },
    limit: cap,
  };
}

/**
 * Sum ai_actions_used across the current UTC calendar month.
 * Reads the monthly rollup view added in 20260503000000_ai_action_quotas.
 */
async function getAiActionsUsedThisMonth(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const monthStart = utcMonthStartDateString();
  const { data } = await supabase
    .from("entitlement_ai_usage_monthly")
    .select("ai_actions_used")
    .eq("user_id", userId)
    .eq("product", PRODUCT_LEADSMART_AGENT)
    .eq("month_start", monthStart)
    .maybeSingle();
  const row = data as { ai_actions_used: number } | null;
  return row?.ai_actions_used ?? 0;
}

/**
 * Sum voice_minutes_used across the current UTC calendar month, from the
 * same monthly rollup view (extended to expose voice minutes).
 */
async function getVoiceMinutesUsedThisMonth(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const monthStart = utcMonthStartDateString();
  const { data } = await supabase
    .from("entitlement_ai_usage_monthly")
    .select("voice_minutes_used")
    .eq("user_id", userId)
    .eq("product", PRODUCT_LEADSMART_AGENT)
    .eq("month_start", monthStart)
    .maybeSingle();
  const row = data as { voice_minutes_used: number } | null;
  return row?.voice_minutes_used ?? 0;
}

function utcMonthStartDateString(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export async function canInviteTeam(
  supabase: SupabaseClient,
  userId: string
): Promise<EntitlementCheckResult> {
  const ent = await getActiveAgentEntitlement(supabase, userId);
  if (!ent) {
    return {
      allowed: false,
      reason: "No active LeadSmart AI Agent entitlement.",
      reasonCode: "no_agent_entitlement",
      plan: null,
      product: PRODUCT_LEADSMART_AGENT,
      currentUsage: {},
      limit: null,
    };
  }
  const allowed = ent.team_access === true;
  return {
    allowed,
    reason: allowed ? null : "Team access is available on Premium. Upgrade to invite collaborators.",
    reasonCode: allowed ? null : ("team_access_not_enabled" satisfies LimitReason),
    plan: ent.plan,
    product: ent.product,
    currentUsage: {},
    limit: ent.team_access ? 1 : 0,
  };
}

function formatPlanLabel(plan: string): string {
  const id = plan.toLowerCase() as AgentPlan;
  return PLAN_CATALOG[id]?.label ?? plan;
}
