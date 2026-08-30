/**
 * CloseBoss usage-based pricing — the SINGLE SOURCE OF TRUTH (rev. 2026-08-19).
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
  // Voice calling. 8 credits is a PRICING choice, not cost recovery — see below.
  //
  // Was 15 until 2026-08-30. At that rate an $79 plan bought 53 minutes, and
  // the standalone AI receptionists a prospect compares us against sell 150-250
  // for $49-109 (Rosie, AgentZap, Goodcall). Losing that comparison mattered
  // more than the extra margin: at 8 credits the same plan buys 100 minutes,
  // which is defensible beside them AND includes a CRM they do not have.
  // Margin barely moved — 81% instead of 87% — because voice was carrying
  // roughly twice the margin of everything else in the first place.
  //
  // MEASURED from the Retell invoice, 2026-08-18 (25-minute billing period):
  //   voice infra $1.38 + voice LLM $1.13 + TTS $0.38     = $0.116/min
  //   + text LLM $0.89 (test chat, post-call analysis)    = $0.151/min all-in
  //
  // So a minute costs ~$0.15, not the ~$0.30 an earlier comment here claimed —
  // that figure was inferred backwards from 15 credits x $0.02 and labelled
  // "measured", which it was not. At 15 credits/min the implied cost per credit
  // for VOICE is ~$0.010, roughly half the $0.02 used elsewhere in this file.
  // Voice therefore carries about 2x more margin than any blended model shows.
  // (fal video is the opposite — listingClip/twinAvatar really are ~$0.02/credit.)
  //
  // Excluded: Twilio telephony, billed separately. Measured on low volume, so
  // re-check if minutes scale into a different Retell tier.
  voicePerMinute: 8,
  listingClip: 15, // video creation — a cinematic listing clip (fal Kling, ~$0.30)
  twinAvatar: 20, // video creation — digital-twin lipsync render (~$0.35)
  ctaEndCard: 5, // video creation — branded end-card appended to a video
  // Included free — not a call and not a video:
  voiceClone: 0, // one-time voice-model setup
  image: 0, // social images render via next/og — no marginal cost
} as const;

export type CreditTierId = "solo" | "pro" | "premium" | "signature";

/**
 * The free tier.
 *
 * Not in CREDIT_TIERS because it is not purchasable — that list drives Stripe
 * checkout and every row in it needs a price id.
 *
 * PERMANENT, not a trial. Two reasons. A CRM proves itself over about ninety
 * days, not fourteen, and asking an agent to pay before they have imported the
 * contacts that create the demand is asking in the wrong order. And the
 * competitive scan came back explicit: no AI receptionist product offers a free
 * tier, so this is the one thing on the price list nobody else has.
 *
 * Everything is included; only the credit allowance is small. 100 credits is
 * about twelve voice minutes — roughly $1.80 of cost per user per month, which
 * buys top-of-funnel far cheaper than advertising does.
 */
export const FREE_TIER = {
  id: "free" as const,
  name: "Free",
  priceUsd: 0,
  monthlyCredits: 100,
  blurb: "Every feature, one seat. Enough to try the AI receptionist.",
} as const;

/**
 * A one-off grant on signup, on top of the monthly allowance.
 *
 * The monthly 100 is not enough to experience a receptionist answering real
 * calls, and an agent who never hears it has no reason to upgrade. This buys
 * about thirty-seven minutes once. The drop to twelve the following month is
 * the upgrade trigger, and it is felt rather than announced.
 */
export const WELCOME_CREDITS = 300;

/**
 * Monthly subscription plans.
 *
 * The price buys the PRODUCT — every feature, one seat. Credits are the usage
 * allowance inside it, and they are spent on only two things: AI phone minutes
 * and video. Tiers differ by how much of that usage they include, never by what
 * the software can do.
 *
 * Worth stating because the plan cards show a credit count most prominently,
 * which reads as "you are buying credits" unless the copy says otherwise.
 *
 * The per-credit rate falls as the tier rises — $0.099, $0.080, $0.075 — so
 * volume is genuinely cheaper rather than merely larger. Signature is the
 * exception at $0.100: it carries the same allowance as Premium because what
 * the extra $100 buys is people, not capacity.
 */
export const CREDIT_TIERS: ReadonlyArray<{
  id: CreditTierId;
  name: string;
  priceUsd: number;
  monthlyCredits: number;
  /** Env var holding this plan's Stripe recurring price id. */
  priceEnv: string;
  /** One-time setup fee in USD, or null. */
  setupFeeUsd: number | null;
  blurb: string;
}> = [
  {
    id: "solo",
    name: "Solo",
    priceUsd: 79,
    monthlyCredits: 800,
    priceEnv: "STRIPE_PRICE_ID_CB_SOLO",
    setupFeeUsd: null,
    blurb: "Every feature, one seat. For steady solo marketing.",
  },
  {
    id: "pro",
    name: "Pro",
    priceUsd: 159,
    monthlyCredits: 2000,
    priceEnv: "STRIPE_PRICE_ID_CB_PRO",
    setupFeeUsd: null,
    blurb: "Every feature, one seat. For daily calling and regular video.",
  },
  {
    id: "premium",
    name: "Premium",
    priceUsd: 299,
    monthlyCredits: 4000,
    priceEnv: "STRIPE_PRICE_ID_CB_PREMIUM",
    setupFeeUsd: null,
    blurb: "Every feature, one seat. For high-volume calling and video.",
  },
  {
    // Same credits as Premium on purpose. The extra $100 a month buys people —
    // white-glove onboarding, concierge support, a named contact — not
    // capacity, and the price list should say so rather than inventing a
    // larger allowance to justify the gap.
    //
    // The setup fee is not greed. White-glove onboarding is two to four hours
    // of a specialist; at +$100/month alone this tier does not break even until
    // about month four, and loses money outright on anyone who leaves before
    // then. Lofty charges $299-1,499 for the same thing.
    id: "signature",
    name: "Signature",
    priceUsd: 399,
    monthlyCredits: 4000,
    priceEnv: "STRIPE_PRICE_ID_CB_SIGNATURE",
    setupFeeUsd: 499,
    blurb: "Everything in Premium, plus a specialist who sets it all up with you.",
  },
] as const;

/**
 * Voice minutes a monthly grant buys at the CURRENT rate. Render display copy
 * from this rather than hardcoding minutes in a string.
 *
 * The `blurb` fields above drifted badly TWICE. First they were written when
 * voice cost 8 credits/min and still claimed 125 / 375 / 1,600 minutes after
 * the rate moved to 15, overstating Scale by 60%. Then they were rewritten as
 * vague prose — "a few videos" for a tier that actually affords 25 — which is
 * the same failure wearing different clothes: a number a human guessed.
 *
 * So blurbs carry no quantities at all now. Every figure a customer reads is
 * computed from CREDIT_COSTS by the helpers below. A pricing page is a promise;
 * a promise nobody recalculates is a promise that expires quietly.
 */
export function approxCallMinutes(monthlyCredits: number): number {
  return Math.floor(monthlyCredits / CREDIT_COSTS.voicePerMinute);
}

/** Videos of a given kind a monthly grant buys — same reasoning as above. */
export function approxVideos(monthlyCredits: number, kind: "listingClip" | "twinAvatar"): number {
  return Math.floor(monthlyCredits / CREDIT_COSTS[kind]);
}

/**
 * One-off credit top-up packs (no commitment). Deliberately priced ~18-20%
 * ABOVE the equivalent plan's per-credit rate — if a pack ever undercuts a
 * subscription, the subscription stops making sense and the recurring revenue
 * quietly converts to one-offs. Keep every pack above its matching tier.
 */
export const CREDIT_PACKS: ReadonlyArray<{
  id: string;
  credits: number;
  priceUsd: number;
  /** Env var holding this pack's Stripe one-time price id. */
  priceEnv: string;
}> = [
  { id: "pack_500", credits: 500, priceUsd: 69, priceEnv: "STRIPE_PRICE_ID_CB_PACK_500" },
  { id: "pack_2k", credits: 2000, priceUsd: 189, priceEnv: "STRIPE_PRICE_ID_CB_PACK_2K" },
  { id: "pack_4k", credits: 4000, priceUsd: 359, priceEnv: "STRIPE_PRICE_ID_CB_PACK_4K" },
] as const;

/**
 * Read a Stripe Price id out of the environment, validating its shape.
 *
 * Guards a real misconfiguration we hit in production: an env var whose VALUE
 * was set to its own NAME ("STRIPE_PRICE_ID_CB_GROWTH"), which sailed through
 * and made Stripe reject the checkout with a cryptic "No such price". Every
 * Stripe Price id starts with `price_`, so anything else is a config error we
 * can name precisely instead of forwarding to Stripe.
 */
export function readStripePriceId(envVar: string): { id: string } | { error: string } {
  const raw = process.env[envVar]?.trim();
  if (!raw) return { error: `Billing isn't set up yet (missing ${envVar}).` };
  if (!raw.startsWith("price_")) {
    return {
      error: `Billing is misconfigured: ${envVar} should hold a Stripe price id starting with "price_".`,
    };
  }
  return { id: raw };
}

/**
 * Kept as aliases so nothing breaks mid-rename.
 *
 * The 14-day trial is gone: FREE_TIER is permanent, so free IS the trial and a
 * second countdown alongside it would only confuse the page. WELCOME_CREDITS
 * is the one-off grant that used to be the trial allowance.
 *
 * @deprecated use WELCOME_CREDITS and FREE_TIER.
 */
export const TRIAL_CREDITS = WELCOME_CREDITS;
/** @deprecated there is no trial window any more — the free tier does not expire. */
export const TRIAL_DAYS = 0;

/** Existing paid users get this many months of credits up front on migration. */
export const GRANDFATHER_MONTHS = 2;

/** SMS is included (fair-use), not credit-metered. A soft monthly cap can be
 *  added later off message_logs if abuse ever appears. */
export const SMS_INCLUDED = true;
