/**
 * Central access-control rules for PropertyTools AI.
 * Guest → limited anonymous use; Free → registered limits; Premium → unlimited (paid subscription).
 */

export type AccessTier = "guest" | "free" | "premium";

export type ToolPeriod = "daily" | "monthly";

export type ToolLimitInfo = {
  used: number;
  /** null = unlimited */
  limit: number | null;
  period: ToolPeriod;
};

export type CanUseToolResult = {
  allowed: boolean;
  tier: AccessTier;
  tool: string;
  remaining: number | null;
  limit: number | null;
  reason?: string;
};

/** Tools aligned with DB RPC `increment_usage` + product surface area */
export const KNOWN_TOOLS = [
  "cma",
  "estimator",
  "home_value",
  "mortgage_calculator",
  "advanced_report",
  "ai_analyzer",
] as const;

export type KnownTool = (typeof KNOWN_TOOLS)[number];

/** Default per-tier limits when no server override exists (guest = client-enforced). */
export const DEFAULT_LIMITS: Record<
  AccessTier,
  Record<string, { limit: number | null; period: ToolPeriod }>
> = {
  guest: {
    default: { limit: 8, period: "daily" },
    home_value: { limit: 3, period: "daily" },
    cma: { limit: 2, period: "daily" },
    estimator: { limit: 2, period: "daily" },
    mortgage_calculator: { limit: 15, period: "daily" },
    advanced_report: { limit: 0, period: "daily" },
    ai_analyzer: { limit: 1, period: "daily" },
  },
  free: {
    default: { limit: 30, period: "daily" },
    home_value: { limit: 10, period: "daily" },
    cma: { limit: 1, period: "monthly" },
    estimator: { limit: 3, period: "monthly" },
    mortgage_calculator: { limit: 50, period: "daily" },
    advanced_report: { limit: 3, period: "monthly" },
    ai_analyzer: { limit: 5, period: "monthly" },
  },
  premium: {
    default: { limit: null, period: "daily" },
    home_value: { limit: null, period: "daily" },
    cma: { limit: null, period: "monthly" },
    estimator: { limit: null, period: "monthly" },
    mortgage_calculator: { limit: null, period: "daily" },
    advanced_report: { limit: null, period: "monthly" },
    ai_analyzer: { limit: null, period: "monthly" },
  },
};

export function isPremiumSubscriptionStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "").toLowerCase();
  return s === "active" || s === "trialing";
}

export function isPremiumPlan(plan: string | null | undefined): boolean {
  const p = String(plan ?? "").toLowerCase();
  return p === "premium" || p === "elite";
}

/**
 * `leadsmart_users.role` values that grant PropertyTools premium tool access without a paid
 * subscription (same Supabase project as CloseBoss). DB may store `user` for consumers (not premium).
 */
export const PREMIUM_GRANT_ROLES = new Set([
  "agent",
  "broker",
  "broker_owner",
  "managing_broker",
  "team_lead",
  "brokerage_admin",
  "owner",
  "partner",
  "admin",
  "support",
]);

export function isPremiumGrantRole(role: string | null | undefined): boolean {
  const r = String(role ?? "")
    .toLowerCase()
    .trim();
  return r !== "" && PREMIUM_GRANT_ROLES.has(r);
}

/** UI + paywall: premium tier (subscription, elite plan, or role grant) or paid elite/premium plan. */
export function hasPremiumToolAccess(input: {
  tier?: AccessTier | null;
  plan?: string | null;
}): boolean {
  if (input.tier === "premium") return true;
  return isPremiumPlan(input.plan);
}

/**
 * Resolve tier from auth + profile fields (server or client).
 */
export function resolveAccessTier(input: {
  userId: string | null | undefined;
  plan?: string | null;
  subscriptionStatus?: string | null;
  /** From `leadsmart_users.role` (RBAC); agents/brokers/admins/support get premium on PropertyTools. */
  accountRole?: string | null;
  /** From `propertytools_users.tier` — consumer paid tier (`basic` | `premium`). */
  propertytoolsTier?: "basic" | "premium" | null;
}): AccessTier {
  if (!input.userId) return "guest";
  if (isPremiumGrantRole(input.accountRole)) return "premium";
  if (input.propertytoolsTier === "premium") return "premium";
  if (isPremiumSubscriptionStatus(input.subscriptionStatus)) return "premium";
  if (isPremiumPlan(input.plan)) return "premium";
  return "free";
}

function resolveDefaultLimit(tier: AccessTier, tool: string): { limit: number | null; period: ToolPeriod } {
  const map = DEFAULT_LIMITS[tier];
  const key = tool.trim().toLowerCase();
  return map[key] ?? map["default"] ?? { limit: 10, period: "daily" };
}

/**
 * Pure check: given usage counters, may the user run the tool once more?
 * Pass `limit: null` for unlimited (premium).
 */
export function canUseTool(input: {
  tier: AccessTier;
  tool: string;
  used: number;
  /** If omitted, uses DEFAULT_LIMITS for tier+tool */
  limit?: number | null;
  period?: ToolPeriod;
}): CanUseToolResult {
  const tool = input.tool.trim().toLowerCase() || "default";
  const tier = input.tier;

  if (tier === "premium" && (input.limit === undefined || input.limit === null)) {
    return {
      allowed: true,
      tier,
      tool,
      remaining: null,
      limit: null,
    };
  }

  const resolved =
    input.limit !== undefined
      ? { limit: input.limit, period: input.period ?? "daily" }
      : resolveDefaultLimit(tier, tool);

  const limit = resolved.limit;
  if (limit === null) {
    return { allowed: true, tier, tool, remaining: null, limit: null };
  }

  const used = Math.max(0, Number(input.used) || 0);
  const remaining = Math.max(0, limit - used);
  const allowed = used < limit;

  return {
    allowed,
    tier,
    tool,
    remaining,
    limit,
    reason: allowed ? undefined : "limit_reached",
  };
}

/** Map product tool keys → `increment_usage` p_tool values (DB). */
export function toolToRpcName(tool: string): "cma" | "estimator" | null {
  const t = tool.trim().toLowerCase();
  if (t === "cma" || t === "smart_cma" || t === "cma_report") return "cma";
  if (t === "estimator" || t === "home_value" || t === "home-value") return "estimator";
  return null;
}
