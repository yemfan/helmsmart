/**
 * Maps `user_profiles` + auth email to the admin billing table shape.
 * Plan keys align with the admin UI (`BillingPlan`).
 */

export type BillingStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete";

export type BillingPlan =
  | "consumer_free"
  | "consumer_premium"
  | "agent_starter"
  | "agent_pro"
  | "loan_broker_pro";

export type BillingRecord = {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
  plan: BillingPlan;
  status: BillingStatus;
  amount_monthly: number;
  billing_provider: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
};

const PLAN_MRR_USD: Record<BillingPlan, number> = {
  consumer_free: 0,
  consumer_premium: 29,
  agent_starter: 49,
  agent_pro: 99,
  loan_broker_pro: 149,
};

export function estimatedMrrForPlan(plan: BillingPlan): number {
  return PLAN_MRR_USD[plan] ?? 0;
}

/** Map Stripe / app `subscription_status` to UI status. */
export function mapSubscriptionStatus(raw: string | null | undefined): BillingStatus {
  const v = String(raw ?? "").toLowerCase().trim();
  if (v === "active") return "active";
  if (v === "trialing") return "trialing";
  if (v === "past_due") return "past_due";
  if (v === "canceled" || v === "cancelled") return "canceled";
  if (v === "incomplete" || v === "incomplete_expired") return "incomplete";
  if (v === "unpaid") return "past_due";
  // inactive, guest, paused — show as canceled in admin UI
  return "canceled";
}

/** Derive display plan from `leadsmart_users.plan` + `role`. */
export function deriveBillingPlan(plan: string | null | undefined, role: string | null | undefined): BillingPlan {
  const p = String(plan ?? "free").toLowerCase().trim();
  const r = String(role ?? "user").toLowerCase().trim();

  const isBroker =
    r === "broker" ||
    r === "broker_owner" ||
    r === "managing_broker" ||
    r === "team_lead" ||
    r === "brokerage_admin";

  if (isBroker) {
    if (p === "premium" || p === "pro") return "loan_broker_pro";
    return "consumer_free";
  }

  if (r === "agent" || r === "admin" || r === "support") {
    if (p === "premium") return "agent_pro";
    if (p === "pro") return "agent_starter";
    return "consumer_free";
  }

  if (p === "premium") return "consumer_premium";
  return "consumer_free";
}

/** Persist UI plan back to `leadsmart_users.plan` (free | pro | premium). */
export function billingPlanToDbPlan(bp: BillingPlan): "free" | "pro" | "premium" {
  switch (bp) {
    case "consumer_free":
      return "free";
    case "consumer_premium":
      return "premium";
    case "agent_starter":
      return "pro";
    case "agent_pro":
    case "loan_broker_pro":
      return "premium";
    default:
      return "free";
  }
}

/** Map UI status to `leadsmart_users.subscription_status`. */
export function billingStatusToDb(status: BillingStatus): string {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "incomplete":
      return "incomplete";
    default:
      return "inactive";
  }
}

export type UserProfileBillingRow = {
  user_id: string;
  role: string | null;
  full_name: string | null;
  plan: string | null;
  subscription_status: string | null;
  created_at: string | null;
  subscription_current_period_start?: string | null;
  subscription_current_period_end?: string | null;
  subscription_cancel_at_period_end?: boolean | null;
};

/** Row from `public.billing_subscriptions` (see 20260419000000_billing_subscriptions.sql). */
export type BillingSubscriptionRow = {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string | null;
  role: string;
  plan: string;
  status: string;
  amount_monthly: number | string | null;
  billing_provider: string | null;
  provider_customer_id?: string | null;
  provider_subscription_id?: string | null;
  provider_price_id?: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
};

function isCanonicalBillingPlan(v: string): v is BillingPlan {
  return (
    v === "consumer_free" ||
    v === "consumer_premium" ||
    v === "agent_starter" ||
    v === "agent_pro" ||
    v === "loan_broker_pro"
  );
}

/** Map `billing_subscriptions` row → admin UI record (`id` = subscription PK). */
export function subscriptionRowToBillingRecord(row: BillingSubscriptionRow): BillingRecord {
  const rawPlan = String(row.plan ?? "").trim();
  const plan = isCanonicalBillingPlan(rawPlan)
    ? rawPlan
    : deriveBillingPlan(row.plan, row.role);

  return {
    id: row.id,
    user_id: row.user_id ?? "",
    email: row.email,
    full_name: row.full_name ?? null,
    role: String(row.role ?? "user"),
    plan,
    status: mapSubscriptionStatus(row.status),
    amount_monthly: (() => {
      const raw = row.amount_monthly;
      const n = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(n) ? n : estimatedMrrForPlan(plan);
    })(),
    billing_provider: String(row.billing_provider ?? "stripe"),
    current_period_start: row.current_period_start ?? null,
    current_period_end: row.current_period_end ?? null,
    cancel_at_period_end: Boolean(row.cancel_at_period_end),
    created_at: row.created_at ?? new Date().toISOString(),
  };
}

export function profileRowToBillingRecord(
  row: UserProfileBillingRow,
  email: string
): BillingRecord {
  const role = String(row.role ?? "user");
  const bp = deriveBillingPlan(row.plan, row.role);
  const st = mapSubscriptionStatus(row.subscription_status);

  return {
    id: row.user_id,
    user_id: row.user_id,
    email,
    full_name: row.full_name ?? null,
    role,
    plan: bp,
    status: st,
    amount_monthly: estimatedMrrForPlan(bp),
    billing_provider: "stripe",
    current_period_start: row.subscription_current_period_start ?? null,
    current_period_end: row.subscription_current_period_end ?? null,
    cancel_at_period_end: Boolean(row.subscription_cancel_at_period_end),
    created_at: row.created_at ?? new Date().toISOString(),
  };
}

/** Client filter: "consumer" matches casual users. */
export function roleMatchesFilter(dbRole: string, filter: string): boolean {
  if (filter === "all") return true;
  const r = dbRole.toLowerCase();
  if (filter === "consumer") {
    return r === "user" || r === "consumer" || r === "";
  }
  if (filter === "agent") return r === "agent" || r === "admin" || r === "support";
  if (filter === "loan_broker") {
    return (
      r === "broker" ||
      r === "broker_owner" ||
      r === "managing_broker" ||
      r === "team_lead" ||
      r === "brokerage_admin"
    );
  }
  return r === filter;
}
