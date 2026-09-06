import { SUBSCRIPTION_EVENT_TYPES } from "@/lib/analytics/eventCatalog";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { firstTenMinutes, type FirstMomentRow, type FirstTenMinutes } from "@/lib/analytics/firstTenMinutes";

const PAYING_STATUSES = ["active", "trialing"] as const;

export type SubscriptionEventRow = {
  created_at: string;
  stripe_subscription_id: string | null;
  amount: number | null;
  event_type: string;
  user_id: string | null;
};

export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

export function clampIntDays(raw: string | null, fallback: number, max = 365): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

/** Sum of `amount_monthly` for rows in a paying state (canonical MRR). */
export async function computeCurrentMrr(): Promise<{ mrr: number; payingRowCount: number }> {
  const { data, error } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("amount_monthly, status")
    .in("status", [...PAYING_STATUSES]);

  if (error) throw error;

  const rows = (data ?? []) as { amount_monthly?: number | string | null; status?: string | null }[];
  let mrr = 0;
  for (const r of rows) {
    mrr += Number(r.amount_monthly ?? 0);
  }
  return { mrr, payingRowCount: rows.length };
}

export async function computeMrrByPlan(): Promise<{ plan: string; mrr: number; subscribers: number }[]> {
  const { data, error } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("plan, amount_monthly, status")
    .in("status", [...PAYING_STATUSES]);

  if (error) throw error;

  const map = new Map<string, { mrr: number; subscribers: number }>();
  for (const r of data ?? []) {
    const plan = String((r as { plan?: string }).plan ?? "unknown");
    const amt = Number((r as { amount_monthly?: number | string | null }).amount_monthly ?? 0);
    const cur = map.get(plan) ?? { mrr: 0, subscribers: 0 };
    cur.mrr += amt;
    cur.subscribers += 1;
    map.set(plan, cur);
  }

  return [...map.entries()]
    .map(([plan, v]) => ({ plan, mrr: v.mrr, subscribers: v.subscribers }))
    .sort((a, b) => b.mrr - a.mrr);
}

/** Distinct profile ids with at least one paying billing row. */
export async function countDistinctPayingUsers(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("billing_subscriptions")
    .select("user_id")
    .in("status", [...PAYING_STATUSES])
    .not("user_id", "is", null);

  if (error) throw error;
  const ids = new Set<string>();
  for (const r of data ?? []) {
    const id = (r as { user_id?: string | null }).user_id;
    if (id) ids.add(id);
  }
  return ids.size;
}

/** Monthly active users: distinct `usage_events.user_id` in the window. */
export async function countMauUsage(sinceIso: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("usage_events")
    .select("user_id")
    .gte("created_at", sinceIso)
    .not("user_id", "is", null);

  if (error) throw error;
  const ids = new Set<string>();
  for (const r of data ?? []) {
    const id = (r as { user_id?: string | null }).user_id;
    if (id) ids.add(id);
  }
  return ids.size;
}

/**
 * Activation: share of onboarded users who sent a first reply within 7 days of onboarding completion.
 */
export async function computeActivationRate(): Promise<{
  onboarded: number;
  activatedWithin7d: number;
  rate: number | null;
}> {
  const { data, error } = await supabaseAdmin
    .from("leadsmart_funnel_state")
    .select("onboarding_completed_at, first_reply_at")
    .not("onboarding_completed_at", "is", null);

  if (error) throw error;

  const rows = data ?? [];
  const onboarded = rows.length;
  let activatedWithin7d = 0;
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  for (const r of rows) {
    const row = r as { onboarding_completed_at?: string | null; first_reply_at?: string | null };
    if (!row.first_reply_at || !row.onboarding_completed_at) continue;
    const o = new Date(row.onboarding_completed_at).getTime();
    const f = new Date(row.first_reply_at).getTime();
    if (f >= o && f <= o + weekMs) activatedWithin7d += 1;
  }

  return {
    onboarded,
    activatedWithin7d,
    rate: onboarded > 0 ? activatedWithin7d / onboarded : null,
  };
}

/**
 * Checkout → paid in the window: distinct users with `subscription_active_crm` after `upgrade_checkout_started`
 * (both events in window; user must appear in checkout cohort).
 */
export async function computeCheckoutConversionRate(sinceIso: string): Promise<{
  checkoutStartedUsers: number;
  convertedUsers: number;
  rate: number | null;
}> {
  const { data: starts, error: e1 } = await supabaseAdmin
    .from("leadsmart_funnel_events")
    .select("user_id")
    .eq("event_type", "upgrade_checkout_started")
    .gte("created_at", sinceIso);

  if (e1) throw e1;

  const { data: wins, error: e2 } = await supabaseAdmin
    .from("leadsmart_funnel_events")
    .select("user_id")
    .eq("event_type", "subscription_active_crm")
    .gte("created_at", sinceIso);

  if (e2) throw e2;

  const startIds = new Set(
    (starts ?? []).map((r) => (r as { user_id?: string }).user_id).filter(Boolean) as string[]
  );
  const winIds = new Set(
    (wins ?? []).map((r) => (r as { user_id?: string }).user_id).filter(Boolean) as string[]
  );

  let converted = 0;
  for (const id of winIds) {
    if (startIds.has(id)) converted += 1;
  }

  return {
    checkoutStartedUsers: startIds.size,
    convertedUsers: converted,
    rate: startIds.size > 0 ? converted / startIds.size : null,
  };
}

/**
 * Logo churn (30d): distinct users with `subscription_canceled` in the window /
 * max(1, paying distinct users today + churned distinct in window).
 * Documented approximation when subscriber mix shifts; prefer nightly snapshots at scale.
 */
export async function computeChurnMetrics(churnWindowDays: number): Promise<{
  churnedUsers: number;
  payingUsersNow: number;
  churnRate: number | null;
  definition: string;
}> {
  const sinceIso = daysAgoIso(churnWindowDays);

  const { data: churnRows, error: e1 } = await supabaseAdmin
    .from("subscription_events")
    .select("user_id")
    .eq("event_type", SUBSCRIPTION_EVENT_TYPES.SUBSCRIPTION_CANCELED)
    .gte("created_at", sinceIso)
    .not("user_id", "is", null);

  if (e1) throw e1;

  const churned = new Set(
    (churnRows ?? []).map((r) => (r as { user_id?: string }).user_id).filter(Boolean) as string[]
  );

  const payingUsersNow = await countDistinctPayingUsers();
  const denom = Math.max(1, payingUsersNow + churned.size);
  const churnRate = churned.size / denom;

  return {
    churnedUsers: churned.size,
    payingUsersNow,
    churnRate,
    definition:
      "churned_users_30d / max(1, paying_distinct_users_now + churned_distinct_30d); cancel events from subscription.deleted / sync",
  };
}

export async function fetchSubscriptionEventsForMrrSeries(sinceIso: string): Promise<SubscriptionEventRow[]> {
  const { data, error } = await supabaseAdmin
    .from("subscription_events")
    .select("created_at, stripe_subscription_id, amount, event_type, user_id")
    .gte("created_at", sinceIso)
    .not("stripe_subscription_id", "is", null)
    .in("event_type", [
      SUBSCRIPTION_EVENT_TYPES.BILLING_UPDATED,
      SUBSCRIPTION_EVENT_TYPES.BILLING_INACTIVE,
      SUBSCRIPTION_EVENT_TYPES.SUBSCRIPTION_CANCELED,
    ])
    .order("created_at", { ascending: true })
    .limit(10_000);

  if (error) throw error;
  return (data ?? []) as SubscriptionEventRow[];
}

/**
 * Reconstruct approximate MRR at `asOf` from subscription events (per Stripe subscription id).
 */
export function mrrFromEventsAt(events: SubscriptionEventRow[], asOf: Date): number {
  const t = asOf.getTime();
  const bySub = new Map<string, number>();

  for (const e of events) {
    if (new Date(e.created_at).getTime() > t) break;
    const sid = e.stripe_subscription_id;
    if (!sid) continue;

    if (e.event_type === SUBSCRIPTION_EVENT_TYPES.SUBSCRIPTION_CANCELED) {
      bySub.set(sid, 0);
    } else if (e.event_type === SUBSCRIPTION_EVENT_TYPES.BILLING_INACTIVE) {
      bySub.set(sid, 0);
    } else if (e.event_type === SUBSCRIPTION_EVENT_TYPES.BILLING_UPDATED) {
      bySub.set(sid, Math.max(0, Number(e.amount ?? 0)));
    }
  }

  let sum = 0;
  for (const v of bySub.values()) sum += v;
  return sum;
}

/** One point per week (UTC), ending today, using event replay (requires `stripe_subscription_id` on events). */
export function buildWeeklyMrrSeries(events: SubscriptionEventRow[], weeks: number): { period: string; mrr: number }[] {
  const out: { period: string; mrr: number }[] = [];
  const now = new Date();

  for (let i = weeks - 1; i >= 0; i--) {
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() - i * 7);
    end.setUTCHours(23, 59, 59, 999);
    const label = end.toISOString().slice(0, 10);
    out.push({ period: label, mrr: mrrFromEventsAt(events, end) });
  }

  return out;
}

export async function getUsageBreakdown(sinceIso: string): Promise<{ event_type: string; count: number }[]> {
  const { data, error } = await supabaseAdmin
    .from("usage_events")
    .select("event_type")
    .gte("created_at", sinceIso);

  if (error) throw error;

  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    const et = String((r as { event_type?: string }).event_type ?? "unknown");
    counts.set(et, (counts.get(et) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([event_type, count]) => ({ event_type, count }))
    .sort((a, b) => b.count - a.count);
}

export async function getFunnelStageCounts(windowDays: number): Promise<{
  windowDays: number;
  cumulative: {
    onboarded: number;
    firstReply: number;
    firstAi: number;
  };
  inWindowDistinctUsers: Record<string, number>;
}> {
  const sinceIso = daysAgoIso(windowDays);

  const { count: onboarded, error: e0 } = await supabaseAdmin
    .from("leadsmart_funnel_state")
    .select("*", { count: "exact", head: true })
    .not("onboarding_completed_at", "is", null);

  if (e0) throw e0;

  const { count: firstReply, error: e1 } = await supabaseAdmin
    .from("leadsmart_funnel_state")
    .select("*", { count: "exact", head: true })
    .not("first_reply_at", "is", null);

  if (e1) throw e1;

  const { count: firstAi, error: e2 } = await supabaseAdmin
    .from("leadsmart_funnel_state")
    .select("*", { count: "exact", head: true })
    .not("first_ai_usage_at", "is", null);

  if (e2) throw e2;

  const types = [
    "onboarding_completed",
    "first_reply",
    "first_ai_usage",
    "upgrade_checkout_started",
    "subscription_active_crm",
  ] as const;

  const inWindowDistinctUsers: Record<string, number> = {};

  for (const et of types) {
    const { data, error } = await supabaseAdmin
      .from("leadsmart_funnel_events")
      .select("user_id")
      .eq("event_type", et)
      .gte("created_at", sinceIso);

    if (error) throw error;
    const set = new Set(
      (data ?? []).map((r) => (r as { user_id?: string }).user_id).filter(Boolean) as string[]
    );
    inWindowDistinctUsers[et] = set.size;
  }

  return {
    windowDays,
    cumulative: {
      onboarded: onboarded ?? 0,
      firstReply: firstReply ?? 0,
      firstAi: firstAi ?? 0,
    },
    inWindowDistinctUsers,
  };
}

export async function countNewPayingEvents(sinceIso: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("leadsmart_funnel_events")
    .select("user_id")
    .eq("event_type", "subscription_active_crm")
    .gte("created_at", sinceIso);

  if (error) throw error;
  return new Set(
    (data ?? []).map((r) => (r as { user_id?: string }).user_id).filter(Boolean) as string[]
  ).size;
}

/**
 * Time to first proposal / first approval per agent, from the
 * `agent_first_moments()` SQL function (one round trip). See
 * lib/analytics/firstTenMinutes.ts for what the numbers mean.
 */
export async function computeFirstTenMinutes(): Promise<FirstTenMinutes> {
  const { data, error } = await supabaseAdmin.rpc("agent_first_moments");
  if (error) throw error;
  return firstTenMinutes((data ?? []) as FirstMomentRow[]);
}
