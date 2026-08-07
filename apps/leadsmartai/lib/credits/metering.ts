import "server-only";

import {
  grantCredits,
  withCredits,
  InsufficientCreditsError,
  type CreditReason,
} from "@/lib/credits/ledger";

/**
 * Credit metering switch — the master toggle between CloseBoss's OLD model
 * (feature-gated plan tiers) and the NEW usage model (everything included, pay
 * per credit). Controlled by `CREDIT_METERING_MODE`:
 *
 *   off      (default) — no-op. Nothing is charged; feature gates stay in force.
 *                        Merging the Phase-2 wiring changes NOTHING in prod.
 *   shadow   — record real consumption to the ledger (may go negative) WITHOUT
 *              blocking anyone. Lets us observe usage before charging for real.
 *   enforce  — the new model is live: paid actions reserve credits up front
 *              (blocked when the balance can't cover them) and feature gates are
 *              bypassed (everything's included; the credit balance is the gate).
 *
 * Default off means this is safe to ship before pricing launches; Phase 3 grants
 * credits and flips the flag.
 */
export type MeteringMode = "off" | "shadow" | "enforce";

export function creditMeteringMode(): MeteringMode {
  const v = (process.env.CREDIT_METERING_MODE || "").trim().toLowerCase();
  return v === "enforce" || v === "shadow" ? v : "off";
}

/** True once the new usage model is live — old feature gates should be bypassed. */
export function meteringEnforced(): boolean {
  return creditMeteringMode() === "enforce";
}

/**
 * Record consumption of an ALREADY-completed action (e.g. a phone call that has
 * ended — you can't un-ring the bell). Never blocks, never throws; may drive the
 * balance negative in shadow/enforce. No-op when metering is off.
 */
export async function meterUsage(userId: string, cost: number, reason: CreditReason): Promise<void> {
  if (creditMeteringMode() === "off" || cost <= 0) return;
  // A negative grant = an always-applied spend that journals and may go negative.
  await grantCredits(userId, -cost, reason).catch(() => {});
}

/**
 * Charge credits AROUND a paid action:
 *   off      — run the work untouched.
 *   shadow   — run the work, then record the spend (never blocks).
 *   enforce  — reserve credits first (throws InsufficientCreditsError if the
 *              balance can't cover it, before any money is spent) and refund if
 *              the work throws.
 */
export async function withCreditsMetered<T>(
  userId: string,
  cost: number,
  reason: CreditReason,
  work: () => Promise<T>,
): Promise<T> {
  const mode = creditMeteringMode();
  if (mode === "off" || cost <= 0) return work();
  if (mode === "shadow") {
    const result = await work();
    await meterUsage(userId, cost, reason);
    return result;
  }
  return withCredits(userId, cost, reason, work);
}

export { InsufficientCreditsError };
