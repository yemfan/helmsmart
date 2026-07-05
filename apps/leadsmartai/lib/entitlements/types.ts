export type ProductKey = "leadsmart_agent";

/**
 * Entitlements-side plan dialect. Uses legacy names for the $49/$99
 * tiers (`growth` = Pro, `elite` = Premium) because they appear in
 * existing `product_entitlements.plan` rows. `signature` was added
 * for the v2.0 ladder — it sits between `elite` and `team` and gets
 * the same coaching + entitlements as `elite` plus five extra
 * Signature-only features (Sphere Intelligence Pro, white-glove
 * onboarding, concierge support, cultural calendar, custom voice
 * tuning).
 *
 * The billing-catalog dialect (`PlanSlug` in `lib/billing/plans.ts`)
 * uses the marketing names — `subscriptionAccess.mapAgentPlanToCrmSlug`
 * bridges the two.
 */
export type AgentPlan = "starter" | "pro" | "premium" | "signature" | "team";

/** @deprecated Prefer `AgentPlan` — kept for existing imports */
export type AgentPlanId = AgentPlan;

export type AlertsLevel = "basic" | "full" | "advanced";
export type ReportsDownloadLevel = "limited" | "full" | "unlimited";

export type LimitReason =
  | "no_agent_entitlement"
  | "cma_limit_reached"
  | "lead_limit_reached"
  | "contact_limit_reached"
  | "download_limit_reached"
  | "team_access_not_enabled"
  | "team_seat_cap_reached"
  | "ai_usage_limit_reached"
  | "voice_minutes_limit_reached"
  | "crm_prediction_locked"
  | "crm_automation_locked"
  | "crm_full_ai_locked";

export type AgentEntitlement = {
  id: string;
  user_id: string;
  product: ProductKey;
  plan: AgentPlan;
  is_active: boolean;
  cma_reports_per_day: number | null;
  max_leads: number | null;
  max_contacts: number | null;
  alerts_level: AlertsLevel | null;
  reports_download_level: ReportsDownloadLevel | null;
  team_access: boolean;
  /** Per-month AI-action cap. NULL = unlimited. */
  ai_actions_per_month: number | null;
  /** Per-month AI voice-minute cap (metered in whole minutes). NULL = unlimited. */
  voice_minutes_per_month: number | null;
  starts_at: string | null;
  ends_at: string | null;
  /** Optional in DB; not in canonical Agent shape but persisted */
  source?: string | null;
  created_at: string;
  updated_at: string;
};

/** @deprecated Prefer `AgentEntitlement` — alias for gradual migration */
export type ProductEntitlementRow = AgentEntitlement;

export type AgentUsageDaily = {
  id: string;
  user_id: string;
  product: ProductKey;
  usage_date: string;
  cma_reports_used: number;
  leads_used: number;
  contacts_used: number;
  report_downloads_used: number;
  ai_actions_used: number;
  /** AI voice minutes consumed (whole minutes, rounded up per call). */
  voice_minutes_used: number;
  created_at: string;
  updated_at: string;
};

/** @deprecated Prefer `AgentUsageDaily` */
export type EntitlementUsageDailyRow = AgentUsageDaily;

/**
 * Compact access outcome (single scalar usage + limit).
 * For detailed checks with human copy + per-metric usage keys, see `EntitlementCheckResult`.
 */
export type AccessResult = {
  allowed: boolean;
  reason: LimitReason | null;
  plan: AgentPlan | null;
  currentUsage: number | null;
  limit: number | null;
};

/** Standard shape returned by limit helpers (API / upgrade modal) */
export type EntitlementCheckResult = {
  allowed: boolean;
  /** Human-readable message */
  reason: string | null;
  /** Machine-readable code */
  reasonCode: LimitReason | null;
  plan: string | null;
  product: string | null;
  currentUsage: Record<string, number>;
  limit: number | null;
};

export type LimitMetric =
  | "cma_report"
  | "lead"
  | "contact"
  | "report_download"
  | "team_invite"
  | "ai_action"
  | "voice_minute";
