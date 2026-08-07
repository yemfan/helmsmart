import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Credit ledger — the unified usage currency for CloseBoss (migration
 * 20260807120000_credit_ledger). Everything with a real per-use cost spends
 * from one `leadsmart_users.credits` balance; every change is journalled to
 * `credit_ledger`. All mutations run server-side with the service role and an
 * explicitly-resolved user id (same posture as consumeAiToken / adminUsage).
 *
 * Credit scale ≈ $0.05 of retail value per credit (kept aligned with
 * MarketingBoss so a unified wallet stays possible later). These are the single
 * source of truth for what an action costs — Phase 2 wires the actual features
 * (voice metering, listing video, twin, swap, CTA, images) to spend them.
 */
export const CREDIT_COSTS = {
  voicePerMinute: 5,
  sms: 1,
  image: 1,
  ctaEndCard: 5,
  listingClip: 5, // one cinematic clip (fal image-to-video) in a listing ad
  listingVideo: 15,
  swap: 20,
  twinAvatar: 20,
  voiceClone: 40,
} as const;

export type CreditReason =
  | "signup"
  | "topup"
  | "monthly_grant"
  | "voice"
  | "sms"
  | "image"
  | "video"
  | "swap"
  | "cta"
  | "twin"
  | "voice_clone"
  | "refund"
  | "admin";

export class InsufficientCreditsError extends Error {
  cost: number;
  constructor(cost: number) {
    super(`Not enough credits — this action costs ${cost}.`);
    this.name = "InsufficientCreditsError";
    this.cost = cost;
  }
}

/** Current credit balance for a user (0 if the account has no row yet). */
export async function getCreditBalance(userId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("leadsmart_users")
    .select("credits")
    .eq("user_id", userId)
    .maybeSingle();
  return ((data as { credits?: number } | null)?.credits) ?? 0;
}

/**
 * Spend `cost` credits. Returns the new balance, or throws
 * InsufficientCreditsError when the balance can't cover it (nothing is spent).
 */
export async function deductCredits(userId: string, cost: number, reason: CreditReason): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("deduct_credits", {
    p_user: userId,
    p_cost: cost,
    p_reason: reason,
  });
  if (error) throw new Error("Could not check credits.");
  const remaining = typeof data === "number" ? data : -1;
  if (remaining < 0) throw new InsufficientCreditsError(cost);
  return remaining;
}

/** Refund `cost` credits (best-effort — used to unwind a failed action). */
export async function refundCredits(userId: string, cost: number, reason: CreditReason = "refund"): Promise<void> {
  await supabaseAdmin.rpc("deduct_credits", { p_user: userId, p_cost: -cost, p_reason: reason });
}

/**
 * Add credits (Stripe top-up, monthly grant, admin, signup). Idempotent when
 * `ref` is supplied — a repeated webhook with the same ref is a no-op. Returns
 * the new balance (or -1 if the account doesn't exist).
 */
export async function grantCredits(
  userId: string,
  amount: number,
  reason: CreditReason,
  ref?: string | null,
): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("grant_credits", {
    p_user: userId,
    p_amount: amount,
    p_reason: reason,
    p_ref: ref ?? null,
  });
  if (error) throw new Error("Could not grant credits.");
  return typeof data === "number" ? data : -1;
}

/**
 * Reserve credits, run `work`, and refund automatically if it throws. The
 * standard spend pattern so callers never charge for a failed generation.
 */
export async function withCredits<T>(
  userId: string,
  cost: number,
  reason: CreditReason,
  work: () => Promise<T>,
): Promise<T> {
  await deductCredits(userId, cost, reason);
  try {
    return await work();
  } catch (e) {
    await refundCredits(userId, cost, reason);
    throw e;
  }
}
