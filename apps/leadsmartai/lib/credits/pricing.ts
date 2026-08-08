/**
 * CloseBoss usage-based pricing — the SINGLE SOURCE OF TRUTH (locked 2026-08-07).
 *
 * Model: everything included, pay for what you use. Plans differ only by credit
 * volume + per-credit price; every account gets every feature (one seat, except
 * Brokerage). Conversation/text is free; only real-cost actions spend credits.
 *
 * Client-safe: pure constants (the `priceEnv` fields are the NAMES of the Stripe
 * price-id env vars, resolved server-side — no secrets here). Phase-3 Stripe
 * wiring reads this; tune any number in one place.
 *
 * Credit scale: 1 credit ≈ $0.02 of our cost, so per-action credits track COGS.
 */

/**
 * We charge for only two things: VOICE CALLING and VIDEO CREATION. Everything
 * else — images, SMS, voice cloning, CRM, chat with Max — is included free. A
 * one-sentence story for users: "you only pay for AI calls and the videos you make."
 */
export const CREDIT_COSTS = {
  voicePerMinute: 8, // voice calling — charged (Retell all-in ~$0.15/min)
  listingClip: 15, // video creation — a cinematic listing clip (fal Kling, ~$0.30)
  twinAvatar: 20, // video creation — digital-twin lipsync render (~$0.35)
  ctaEndCard: 5, // video creation — branded end-card appended to a video
  // Included free — not a call and not a video:
  voiceClone: 0, // one-time voice-model setup
  image: 0, // social images render via next/og — no marginal cost
} as const;

export type CreditTierId = "starter" | "growth" | "scale";

/** Monthly subscription plans — a credit grant + everything included. */
export const CREDIT_TIERS: ReadonlyArray<{
  id: CreditTierId;
  name: string;
  priceUsd: number;
  monthlyCredits: number;
  /** Env var holding this plan's Stripe recurring price id. */
  priceEnv: string;
  blurb: string;
}> = [
  {
    id: "starter",
    name: "Starter",
    priceUsd: 29,
    monthlyCredits: 1000,
    priceEnv: "STRIPE_PRICE_ID_CB_STARTER",
    blurb: "~200 call-min or ~13 listing clips or ~50 twin videos",
  },
  {
    id: "growth",
    name: "Growth",
    priceUsd: 79,
    monthlyCredits: 3000,
    priceEnv: "STRIPE_PRICE_ID_CB_GROWTH",
    blurb: "~600 call-min, heavier video",
  },
  {
    id: "scale",
    name: "Scale",
    priceUsd: 199,
    monthlyCredits: 8000,
    priceEnv: "STRIPE_PRICE_ID_CB_SCALE",
    blurb: "~1,600 call-min, heavy video",
  },
] as const;

/** One-off credit top-up packs (no commitment; priced above the plan rate). */
export const CREDIT_PACKS: ReadonlyArray<{
  id: string;
  credits: number;
  priceUsd: number;
  /** Env var holding this pack's Stripe one-time price id. */
  priceEnv: string;
}> = [
  { id: "pack_1k", credits: 1000, priceUsd: 49, priceEnv: "STRIPE_PRICE_ID_CB_PACK_1K" },
  { id: "pack_3k", credits: 3000, priceUsd: 129, priceEnv: "STRIPE_PRICE_ID_CB_PACK_3K" },
  { id: "pack_8k", credits: 8000, priceUsd: 299, priceEnv: "STRIPE_PRICE_ID_CB_PACK_8K" },
] as const;

/** New signups: a 14-day trial with a sample of credits (no perpetual free tier). */
export const TRIAL_CREDITS = 300;
export const TRIAL_DAYS = 14;

/** Existing paid users get this many months of credits up front on migration. */
export const GRANDFATHER_MONTHS = 2;

/** SMS is included (fair-use), not credit-metered. A soft monthly cap can be
 *  added later off message_logs if abuse ever appears. */
export const SMS_INCLUDED = true;
