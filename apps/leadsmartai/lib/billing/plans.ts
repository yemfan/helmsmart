import type { InternalPlan } from "./stripe-plan-map";

/**
 * LeadSmart agent plan catalog — single source of truth for the
 * upgrade modal, the marketing pricing page, the Stripe checkout, and
 * entitlement gating.
 *
 * Note: the in-app billing surface is now `/dashboard/credits`
 * (usage-based pricing), which renders `CREDIT_TIERS` / `CREDIT_PACKS`
 * from `lib/credits/pricing.ts` — not this catalog. The display fields
 * below (`displayName` / `tagline` / `popular`) are still served to
 * clients by `/api/billing/subscription`.
 *
 * Derived elsewhere (so we don't fork pricing across files):
 *   - `crmStripePrices.ts`     reads `stripePriceEnvVar` / `stripePriceEnvVarAnnual` per slug
 *   - `stripe-plan-map.ts`     reads `internalPlan` per slug
 *   - `subscriptionAccess.ts`  exposes feature gating via `hasFeature`
 *
 * Naming aligns with the marketing pricing page v2.0 (Starter / Pro /
 * Premium / Signature / Team — see `apps/leadsmartai/app/agent/pricing/`).
 *
 * Cadence model: every paid tier exposes a monthly price and (when
 * offered) an annual price. The `price` field stays as the monthly
 * value so legacy callers (`PLANS[slug].price`) keep resolving. The
 * Stripe Price IDs split into `stripePriceEnvVar` (monthly, existing)
 * and `stripePriceEnvVarAnnual` (new — null until the annual SKU is
 * created in Stripe).
 */

export type PlanSlug = "starter" | "pro" | "premium" | "signature" | "team";

export type PlanFeature =
  | "basic_crm"
  | "limited_ai"
  | "full_ai"
  | "automation"
  | "prediction"
  | "multi_agent"
  | "routing"
  | "producer_track_coaching"
  | "top_producer_track_coaching"
  | "bilingual_ai"
  | "sphere_intelligence_pro"
  | "white_glove_onboarding"
  | "concierge_support"
  | "cultural_calendar"
  | "custom_voice_tuning"
  | "bookkeeping"
  | "ai_calling"
  | "social_customization"
  | "premium_avatar";

export type BillingCadence = "monthly" | "annual";

export type PlanDefinition = {
  slug: PlanSlug;
  /** Card title on plan cards. */
  displayName: string;
  /** One-line subtitle on plan cards. */
  tagline: string;
  /** Monthly price in USD. 0 = free (no Stripe subscription). */
  price: number;
  /** Annual price in USD. null = no annual SKU (free tier, or not offered yet). */
  annualPrice: number | null;
  /** Feature flags — drive both `hasFeature` gating and card bullets. */
  features: readonly PlanFeature[];
  /** Env var holding the MONTHLY Stripe Price ID (`price_…`). Null for free. */
  stripePriceEnvVar: string | null;
  /** Env var holding the ANNUAL Stripe Price ID (`price_…`). Null if annual not offered. */
  stripePriceEnvVarAnnual: string | null;
  /** Maps to `InternalPlan` for entitlements + analytics. */
  internalPlan: InternalPlan;
  /** Coaching tier label (Producer Track / Top Producer Track), if any. */
  coachingTier?: "Producer Track" | "Top Producer Track";
  /** Highlight this card as "Most popular". */
  popular?: boolean;
  /**
   * Sales-assisted tier — no self-serve Stripe checkout. The pricing UI shows
   * a "Contact us" CTA and the checkout endpoints reject it. `stripePriceEnvVar`
   * is null for these so no `STRIPE_PRICE_ID_*` is required.
   */
  contactSales?: boolean;
};

/**
 * Canonical plan catalog. Edit ONLY here when prices, features, or
 * Stripe env-var names change — every consumer derives from this.
 */
export const PLANS: Record<PlanSlug, PlanDefinition> = {
  starter: {
    slug: "starter",
    displayName: "Starter",
    tagline: "For new agents testing the platform",
    price: 0,
    annualPrice: null,
    /*
     * `ai_calling` is on every tier: /plans sells the free tier as "enough
     * to try the AI receptionist", and gating it made that sentence false.
     * The spend is bounded by CREDITS, not by this flag — voice costs 8
     * credits a minute, so 100 free credits buys about twelve.
     */
    features: ["basic_crm", "ai_calling"],
    stripePriceEnvVar: null,
    stripePriceEnvVarAnnual: null,
    internalPlan: "crm_starter",
  },
  pro: {
    slug: "pro",
    displayName: "Pro",
    tagline: "Producer Track coaching + bilingual AI",
    price: 79,
    annualPrice: 790,
    features: [
      "basic_crm",
      "limited_ai",
      "bilingual_ai",
      "producer_track_coaching",
      "bookkeeping",
      "ai_calling",
    ],
    // Reuses the existing STRIPE_PRICE_ID_PRO env var — historically
    // the $49 product was wired to this name (the old "starter" CRM
    // slug also pointed here). Same Stripe product, new slug name.
    stripePriceEnvVar: "STRIPE_PRICE_ID_PRO",
    stripePriceEnvVarAnnual: "STRIPE_PRICE_ID_PRO_ANNUAL",
    internalPlan: "crm_pro",
    coachingTier: "Producer Track",
    popular: true,
  },
  premium: {
    slug: "premium",
    displayName: "Premium",
    tagline: "Top Producer Track + full AI",
    price: 199,
    annualPrice: 1990,
    features: [
      "basic_crm",
      "full_ai",
      "automation",
      "prediction",
      "bilingual_ai",
      "top_producer_track_coaching",
      "bookkeeping",
      "ai_calling",
      "premium_avatar",
    ],
    // STRIPE_PRICE_ID_PREMIUM with fallback to STRIPE_PRICE_ID_ELITE
    // is handled in crmStripePrices.ts so existing deployments don't
    // need to rename the env var on day one.
    stripePriceEnvVar: "STRIPE_PRICE_ID_PREMIUM",
    stripePriceEnvVarAnnual: "STRIPE_PRICE_ID_PREMIUM_ANNUAL",
    internalPlan: "crm_premium",
    coachingTier: "Top Producer Track",
  },
  signature: {
    slug: "signature",
    displayName: "Signature",
    tagline: "Relationship-driven agents serving high-value clients",
    price: 399,
    annualPrice: 3990,
    features: [
      "basic_crm",
      "full_ai",
      "automation",
      "prediction",
      "bilingual_ai",
      "top_producer_track_coaching",
      "sphere_intelligence_pro",
      "white_glove_onboarding",
      "concierge_support",
      "cultural_calendar",
      "custom_voice_tuning",
      "bookkeeping",
      "ai_calling",
      "social_customization",
      "premium_avatar",
    ],
    stripePriceEnvVar: "STRIPE_PRICE_ID_SIGNATURE",
    stripePriceEnvVarAnnual: "STRIPE_PRICE_ID_SIGNATURE_ANNUAL",
    internalPlan: "crm_signature",
    coachingTier: "Top Producer Track",
  },
  team: {
    slug: "team",
    displayName: "Team",
    tagline: "Brokerages with shared workflows and rosters",
    price: 299,
    annualPrice: 2990,
    features: [
      "basic_crm",
      "full_ai",
      "automation",
      "prediction",
      "bilingual_ai",
      "multi_agent",
      "routing",
      "top_producer_track_coaching",
      "bookkeeping",
      "ai_calling",
      "social_customization",
      "premium_avatar",
    ],
    // Team is sales-assisted (per-seat, brokerage terms) — no self-serve
    // checkout, so no STRIPE_PRICE_ID_TEAM* env vars are needed. The pricing UI
    // shows "Contact us" and the checkout endpoints reject the team slug.
    stripePriceEnvVar: null,
    stripePriceEnvVarAnnual: null,
    internalPlan: "crm_team",
    coachingTier: "Top Producer Track",
    contactSales: true,
  },
};

/** Iteration helper — render order on plan cards. */
export const PLAN_SLUGS_IN_ORDER: ReadonlyArray<PlanSlug> = [
  "starter",
  "pro",
  "premium",
  "signature",
  "team",
];

export type PlanFeatureUser = {
  plan?: string | null;
};

function planSlugFromString(s: string): PlanSlug | null {
  if (s in PLANS) return s as PlanSlug;
  return null;
}

/**
 * Whether the user's current tier includes a feature flag from `PLANS`.
 * Unknown or empty `plan` → false (no throw).
 */
export function hasFeature(
  user: PlanFeatureUser,
  feature: PlanFeature | string,
): boolean {
  const raw = user.plan;
  const slug = planSlugFromString(typeof raw === "string" ? raw.trim() : "");
  if (!slug) return false;
  return (PLANS[slug].features as readonly string[]).includes(
    feature as PlanFeature,
  );
}

/**
 * Effective monthly cost for a given (plan, cadence). Annual is
 * presented as `$/mo billed annually` in the UI, so callers that need
 * the per-month figure for display can derive it without recomputing.
 * Returns 0 for free tiers. Returns monthly price if `annual` requested
 * but no annual SKU exists.
 */
export function effectiveMonthlyPrice(
  plan: PlanSlug,
  cadence: BillingCadence,
): number {
  const def = PLANS[plan];
  if (cadence === "annual" && def.annualPrice != null) {
    return def.annualPrice / 12;
  }
  return def.price;
}

/**
 * Monthly AI draft generations for capped tiers. `free` is the
 * implicit "no plan" state used by code that reads `plan: null` and
 * needs a tiny default; `starter` matches it (paid name for the same
 * free tier). High caps for Premium / Signature / Team are functionally
 * unlimited but kept finite for safety.
 */
export const AI_USAGE_MONTHLY_LIMIT: Record<PlanSlug | "free", number> = {
  free: 100,
  starter: 100,
  pro: 5_000,
  premium: 999_999,
  signature: 999_999,
  team: 999_999,
};

/**
 * Human names for the gated features, for the message someone reads when a
 * gate stops them. "ai_calling" is the flag; "AI calling" is the thing they
 * were trying to do.
 */
export const PLAN_FEATURE_LABEL: Record<PlanFeature, string> = {
  basic_crm: "The CRM",
  limited_ai: "AI drafting",
  full_ai: "Full AI",
  automation: "Automations",
  prediction: "Predictions",
  multi_agent: "Multiple agents",
  routing: "Lead routing",
  producer_track_coaching: "Producer Track coaching",
  top_producer_track_coaching: "Top Producer Track coaching",
  bilingual_ai: "Bilingual AI",
  sphere_intelligence_pro: "Sphere Intelligence Pro",
  white_glove_onboarding: "White-glove onboarding",
  concierge_support: "Concierge support",
  cultural_calendar: "The cultural calendar",
  custom_voice_tuning: "Custom voice tuning",
  bookkeeping: "Bookkeeping",
  ai_calling: "AI calling",
  social_customization: "Social customization",
  premium_avatar: "Premium avatars",
};

/**
 * The cheapest plan that includes `feature` — what to name when telling
 * someone their current plan doesn't cover what they just tried. Sales-assisted
 * tiers are included: "Team adds it" is still a true and useful answer.
 */
export function lowestPlanWithFeature(feature: PlanFeature): PlanSlug | null {
  const candidates = (Object.values(PLANS) as PlanDefinition[])
    .filter((p) => p.features.includes(feature))
    .sort((a, b) => a.price - b.price);
  return candidates[0]?.slug ?? null;
}
