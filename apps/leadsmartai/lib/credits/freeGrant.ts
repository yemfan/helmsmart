/**
 * The Free tier's monthly credits.
 *
 * `/plans` has advertised "100 credits / month" on the free tier since the
 * 2026-08-30 ladder, and nothing granted them. `FREE_TIER.monthlyCredits` was
 * read by the pricing page and by no other code; the only `monthly_grant` in
 * the app fires from a paid Stripe invoice, which a free account never has.
 * So the page made a promise the product did not keep — worse than a missing
 * feature, because it is on the page where someone decides to trust us.
 *
 * This is the rule that keeps it. The cron is the caller; everything that
 * decides anything lives here, with no I/O, so it can be tested directly.
 *
 * WHY A BALANCE CEILING. An unused free account would otherwise accrue for
 * ever — a year dormant is 1,200 credits, and the first thing that happens
 * after that is somebody spends the lot at once. The ceiling stops accrual
 * without ever taking anything away: at 600 credits an account is holding
 * roughly six months of grants, about 75 AI call minutes, which nobody
 * actually using the product will reach. Someone who spends normally is never
 * affected; someone who has not opened the app since spring stops banking.
 *
 * The alternative — top up TO 100 rather than adding 100 — was rejected. It
 * would eat the 300 welcome credits: a new agent would see their balance fall
 * to 100 in month two, which reads as a clawback rather than a gift.
 */

import { FREE_TIER } from "./pricing";

/** Credits a free account receives each month. Mirrors the price list. */
export const FREE_MONTHLY_CREDITS = FREE_TIER.monthlyCredits;

/**
 * Stop granting above this balance.
 *
 * Not a spending cap and not a deduction — an account over the line simply
 * does not accrue that month, and starts again as soon as it spends back
 * under.
 */
export const FREE_BALANCE_CEILING = 600;

/** The period key a grant belongs to: `YYYY-MM`, UTC. */
export function grantPeriod(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * The idempotency key for one account's grant in one month.
 *
 * `credit_ledger.ref` carries a partial unique index, and `grant_credits`
 * short-circuits on an existing ref — so a cron that runs twice, or retries
 * after a timeout, grants once. The month is IN the key rather than tracked
 * separately, which is what makes a re-run safe without any state of its own.
 */
export function freeGrantRef(userId: string, period: string): string {
  return `free_monthly:${userId}:${period}`;
}

export type FreeGrantDecision =
  | { grant: true; amount: number }
  | { grant: false; reason: "not_free" | "at_ceiling" };

/**
 * Should this account receive its monthly credits?
 *
 * @param account plan is the derived cache on `leadsmart_users`; anything
 *   other than free is on a paid ladder and gets its credits from an invoice.
 */
export function decideFreeGrant(account: {
  plan: string | null | undefined;
  credits: number | null | undefined;
}): FreeGrantDecision {
  const plan = String(account.plan ?? "free").trim().toLowerCase();
  // Only the free tier. A paid account's credits arrive with its invoice, and
  // granting here as well would hand them a second allowance every month.
  if (plan !== "free") return { grant: false, reason: "not_free" };

  const balance = Number(account.credits ?? 0);
  const safeBalance = Number.isFinite(balance) ? balance : 0;
  if (safeBalance >= FREE_BALANCE_CEILING) return { grant: false, reason: "at_ceiling" };

  return { grant: true, amount: FREE_MONTHLY_CREDITS };
}

/** Summary shape the cron returns, so a run is legible in the logs. */
export type FreeGrantRun = {
  period: string;
  considered: number;
  granted: number;
  skippedNotFree: number;
  skippedAtCeiling: number;
  /**
   * Already had this month's grant.
   *
   * Counted separately because the first version reported these as `granted`.
   * `grant_credits` returns the balance whether it granted or short-circuited,
   * so counting the call rather than its effect made a re-run claim it had
   * handed out 1,900 credits when it had handed out none — a log that lies
   * about money, which is the worst kind.
   */
  skippedAlreadyGranted: number;
  failed: number;
};

export function emptyRun(period: string): FreeGrantRun {
  return {
    period,
    considered: 0,
    granted: 0,
    skippedNotFree: 0,
    skippedAtCeiling: 0,
    skippedAlreadyGranted: 0,
    failed: 0,
  };
}
