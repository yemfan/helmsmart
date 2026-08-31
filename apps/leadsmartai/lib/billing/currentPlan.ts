/**
 * Which ONE `billing_subscriptions` row is a user's current agent entitlement.
 *
 * A user can have several rows, and three separate mechanisms put them there:
 *
 *   1. Every Stripe subscription gets its own row (`onConflict:
 *      provider_subscription_id`). Starting a new subscription does not
 *      supersede the old row — nothing in the write path ever touches a
 *      sibling — so an upgrade leaves two rows behind, both `active`.
 *   2. Stripe TEST-mode events land in the same production table as live ones.
 *      Nothing recorded which was which until `livemode` was added.
 *   3. A row with `cancel_at_period_end` stays `active` in Stripe until the
 *      period actually ends, and is only cleared by the terminal
 *      `customer.subscription.deleted` webhook. If that delivery never arrives
 *      the row sits `active` forever, past its own expiry.
 *
 * (1) is legitimate and permanent — a user may genuinely hold an agent SKU and
 * a homeowner product at once — so the reader has to choose rather than assume
 * one row. (2) and (3) are defects; this module refuses to be fooled by them at
 * read time, and the write path plus the reconciliation migration fix them at
 * source.
 *
 * Pure — no I/O — so all of that is testable without a database. The server
 * reader is `resolveAgentPlan.ts`.
 */

import { resolvePlanTier, tierOf, rankOf, type PlanTier } from "./planRank";

/** Statuses that entitle. Mirrors `PAID_STATUSES` in `subscriptionAccess.ts`. */
export const PAYING_STATUSES = ["active", "trialing"] as const;

/** The subset of a `billing_subscriptions` row this decision needs. */
export type BillingRow = {
  plan: string | null;
  status: string | null;
  /**
   * Stripe's own `livemode`. `null`/`undefined` on rows written before the
   * column existed — treated as unknown, and kept, because dropping a real
   * subscriber's entitlement over a missing backfill is the worse error.
   */
  livemode?: boolean | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
};

function isPaying(row: BillingRow): boolean {
  const s = String(row.status ?? "").trim().toLowerCase();
  return (PAYING_STATUSES as readonly string[]).includes(s);
}

/**
 * Has this row outlived the period it was last paid for?
 *
 * Only rows with a known end date can expire. A null `current_period_end` means
 * "we were never told", which is not evidence of expiry.
 */
function isExpired(row: BillingRow, now: Date): boolean {
  if (!row.current_period_end) return false;
  const end = Date.parse(row.current_period_end);
  return Number.isFinite(end) && end <= now.getTime();
}

/**
 * The rows that can actually entitle someone, in no particular order.
 *
 * Test-mode rows are excluded outright: a subscription in Stripe's test ledger
 * was never paid for, and letting one grant production access is how a $0
 * sandbox checkout becomes a real entitlement.
 */
export function entitlingRows(rows: BillingRow[], now: Date = new Date()): BillingRow[] {
  return rows.filter(
    (row) => isPaying(row) && row.livemode !== false && !isExpired(row, now),
  );
}

/**
 * The single row that decides the tier, or null when none does.
 *
 * Highest tier wins; a later `current_period_start` breaks a tie, so an upgrade
 * within the same tier resolves to the subscription actually being billed.
 */
export function pickCurrentSubscription(
  rows: BillingRow[],
  now: Date = new Date(),
): BillingRow | null {
  let best: BillingRow | null = null;
  let bestRank = -1;

  for (const row of entitlingRows(rows, now)) {
    const tier = tierOf(row.plan);
    if (!tier) continue;
    const rank = rankOf(tier);
    if (rank > bestRank) {
      best = row;
      bestRank = rank;
      continue;
    }
    if (rank === bestRank && best) {
      const a = Date.parse(String(row.current_period_start ?? ""));
      const b = Date.parse(String(best.current_period_start ?? ""));
      if (Number.isFinite(a) && (!Number.isFinite(b) || a > b)) best = row;
    }
  }

  return best;
}

/** The tier those rows entitle. `free` when none of them do. */
export function tierFromRows(rows: BillingRow[], now: Date = new Date()): PlanTier {
  return resolvePlanTier(entitlingRows(rows, now).map((r) => r.plan));
}
