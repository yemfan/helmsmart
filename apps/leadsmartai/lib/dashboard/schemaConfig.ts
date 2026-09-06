/**
 * Supabase table/column mapping for dashboard service queries.
 *
 * If your production schema differs from the PropertyTools migrations
 * (`supabase/migrations`), update this file only — dashboard pages and API
 * routes can stay unchanged.
 */

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** --- Leads (`public.leads`) --- */

/** Columns selected in `getPlatformOverview` (admin). */
export const LEADS_SELECT_PLATFORM_OVERVIEW =
  "id, engagement_score, lead_status, status, agent_id, assigned_agent_id, last_contacted_at, next_contact_at, created_at, updated_at";

/** Columns selected in `getAgentDashboardOverview`. */
export const LEADS_SELECT_AGENT_DASHBOARD =
  "id,name,lead_status,status,engagement_score,created_at,updated_at,next_contact_at,search_location,property_address";

/**
 * Column used for `.eq(column, crmAgentId)` on `leads` for the agent dashboard.
 * Switch to `assigned_agent_id` if that is how you scope rows to an agent.
 */
export const LEADS_AGENT_OWNER_COLUMN = "agent_id";

/**
 * Best-effort engagement / quality score for KPIs and sorting.
 * Tries common column names in order.
 */
export function leadEngagementScore(row: Record<string, unknown>): number {
  for (const key of ["engagement_score", "nurture_score", "lead_score", "intent_score"]) {
    const v = num(row[key]);
    if (v != null) return v;
  }
  return 0;
}

/**
 * Whether a lead counts as assigned to an agent (pipeline / LeadSmart AI heuristics).
 */
export function leadRowHasAssignedAgent(row: Record<string, unknown>): boolean {
  for (const key of ["assigned_agent_id", "assigned_crm_agent_id", "agent_id"]) {
    const v = row[key];
    if (v != null && String(v).trim() !== "") return true;
  }
  return false;
}

/** --- Billing (`public.billing_subscriptions`) --- */

export const BILLING_SUBSCRIPTIONS_TABLE = "billing_subscriptions";

export const BILLING_SUBSCRIPTIONS_SELECT = "status, plan, amount_monthly, role";

/**
 * Monthly recurring revenue from a subscription row.
 * Tries `amount_monthly`, `mrr`, then cent-based amounts.
 */
export function subscriptionMonthlyRevenue(row: Record<string, unknown>): number {
  const direct = num(row.amount_monthly) ?? num(row.mrr);
  if (direct != null) return direct;

  const cents =
    num(row.amount_cents) ?? num(row.amount_monthly_cents) ?? num(row.mrr_cents);
  if (cents != null) return cents / 100;

  return 0;
}

/** --- Loan broker --- */

/**
 * Table for loan pipeline / borrower queue. Not in all migrations — if missing,
 * the loan broker dashboard returns an empty snapshot.
 * Schema: `supabase/migrations/20260424000000_loan_applications.sql` (apply when ready).
 * Prefer `created_at` for DB date filters; if the column is missing, the service retries
 * with {@link LOAN_APPLICATIONS_SELECT_WITHOUT_CREATED_AT} and filters by `updated_at` in memory.
 */
export const LOAN_APPLICATIONS_TABLE = "loan_applications";

export const LOAN_APPLICATIONS_SELECT =
  "id,status,borrower_name,loan_amount,readiness,docs_pending_count,created_at,updated_at";

/** Legacy row shape when `created_at` is not on the table yet. */
export const LOAN_APPLICATIONS_SELECT_WITHOUT_CREATED_AT =
  "id,status,borrower_name,loan_amount,readiness,docs_pending_count,updated_at";

/**
 * Column matched to the resolved broker id.
 */
export const LOAN_APPLICATIONS_BROKER_COLUMN = "assigned_broker_id";

/** --- Tool analytics (`public.tool_events`) --- */

/**
 * Resolve a "page" label from `tool_events.metadata` JSON for top-pages KPIs.
 * Checks several common keys and a nested `context` object.
 */
export function pageFromToolEventMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  const keys = ["page", "path", "url", "pathname", "route", "href"] as const;
  for (const k of keys) {
    const v = m[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  const ctx = m.context;
  if (ctx && typeof ctx === "object") {
    const c = ctx as Record<string, unknown>;
    for (const k of ["page", "path", "url"] as const) {
      const v = c[k];
      if (typeof v === "string" && v.trim()) return v;
    }
  }
  return null;
}
