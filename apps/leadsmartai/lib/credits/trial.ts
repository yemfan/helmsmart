import "server-only";

import { grantCredits, getCreditBalance } from "@/lib/credits/ledger";
import { TRIAL_CREDITS } from "@/lib/credits/pricing";

/**
 * Grant the one-time signup trial credits, then return the current balance.
 * Idempotent per user (ref `signup:<uid>`), so calling it on every balance
 * read is safe — each account is seeded exactly once. Harmless while metering
 * is off; ensures no one sits at a 0 balance when the switch flips.
 */
export async function ensureTrialCreditsAndBalance(userId: string): Promise<number> {
  if (TRIAL_CREDITS > 0) {
    await grantCredits(userId, TRIAL_CREDITS, "signup", `signup:${userId}`).catch(() => {});
  }
  return getCreditBalance(userId);
}
