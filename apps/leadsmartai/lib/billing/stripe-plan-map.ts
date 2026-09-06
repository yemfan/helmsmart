import { CREDIT_TIERS } from "@/lib/credits/pricing";

/**
 * Canonical product/plan keys (admin UI + `billing_subscriptions.plan`).
 * Keep aligned with `BillingPlan` in `@/lib/admin/billingRecords`.
 */
export type InternalPlan =
  | "consumer_free"
  | "consumer_premium"
  | "agent_starter"
  | "agent_pro"
  | "crm_solo"
  /** LeadSmart CRM tiers — derived from `lib/billing/plans.ts`
   *  `PLANS[slug].internalPlan`. Keep this union in sync with the
   *  catalog when slugs are added or renamed. Each `crm_*` plan
   *  covers BOTH monthly and annual cadences; cadence is stored
   *  separately on the subscription row (`billing_cadence`). */
  | "crm_starter"
  | "crm_pro"
  | "crm_premium"
  | "crm_signature"
  | "crm_team";

/** Demo / fixture Price IDs. In production, also set `STRIPE_PRICE_ID_*` env vars (see `mapStripePriceToPlan`). */
const PRICE_ID_TO_PLAN: Record<string, InternalPlan> = {
  price_consumer_premium: "consumer_premium",
  price_agent_starter: "agent_starter",
  price_agent_pro: "agent_pro",
  /** Alias: Agent Premium SKU maps to Elite (`agent_pro`) entitlements */
  price_agent_premium: "agent_pro",
  price_crm_starter: "crm_starter",
  price_crm_pro: "crm_pro",
  price_crm_pro_annual: "crm_pro",
  price_crm_premium: "crm_premium",
  price_crm_premium_annual: "crm_premium",
  price_crm_signature: "crm_signature",
  price_crm_signature_annual: "crm_signature",
  price_crm_team: "crm_team",
  price_crm_team_annual: "crm_team",
};

/**
 * CRM env-var → InternalPlan map. Mirrors the catalog's
 * `stripePriceEnvVar` / `stripePriceEnvVarAnnual` per slug — keeps a
 * single naming source. `STRIPE_PRICE_ID_ELITE` is honored as a
 * legacy alias for the Premium tier so deployments that haven't
 * renamed the env var yet keep resolving correctly.
 *
 * Both monthly and annual Price IDs resolve to the SAME `InternalPlan`
 * because cadence is tracked separately on the subscription row. The
 * entitlements derived from `internal_plan` don't change between
 * cadences.
 */
const CRM_ENV_TO_PLAN: ReadonlyArray<{ envKey: string; plan: InternalPlan }> = [
  /*
   * The live credit ladder. Without these the CB price ids match nothing and
   * every paid checkout is recorded as `consumer_free` — which is exactly what
   * happened to the first real $59 subscription.
   *
   * IT HAPPENED TWICE. The entries that fixed it named the tiers of the day,
   * Starter / Growth / Scale. The ladder was renamed to Solo / Pro / Premium /
   * Signature and this list was not, so it recognised three env vars that no
   * tier defines any more and none of the four that checkout actually charges
   * with. A customer paying $399 was entitled to the free plan.
   *
   * These are DERIVED from CREDIT_TIERS now, so a rename cannot desync them
   * again. Each tier keeps its own InternalPlan: entitlements do vary by tier
   * (Facebook ads on Pro and up, phone support on Premium and Signature,
   * coaching by track), so collapsing them would flatten the matrix.
   */
  ...CREDIT_TIERS.flatMap((tier) => {
    const plan = `crm_${tier.id}` as InternalPlan;
    return [
      { envKey: tier.priceEnv, plan },
      { envKey: `${tier.priceEnv}_ANNUAL`, plan },
    ];
  }),
  { envKey: "STRIPE_PRICE_ID_PRO", plan: "crm_pro" },
  { envKey: "STRIPE_PRICE_ID_PRO_ANNUAL", plan: "crm_pro" },
  { envKey: "STRIPE_PRICE_ID_PREMIUM", plan: "crm_premium" },
  { envKey: "STRIPE_PRICE_ID_PREMIUM_ANNUAL", plan: "crm_premium" },
  { envKey: "STRIPE_PRICE_ID_ELITE", plan: "crm_premium" },
  { envKey: "STRIPE_PRICE_ID_SIGNATURE", plan: "crm_signature" },
  { envKey: "STRIPE_PRICE_ID_SIGNATURE_ANNUAL", plan: "crm_signature" },
  { envKey: "STRIPE_PRICE_ID_TEAM", plan: "crm_team" },
  { envKey: "STRIPE_PRICE_ID_TEAM_ANNUAL", plan: "crm_team" },
];

function planFromEnv(priceId: string): InternalPlan | undefined {
  if (process.env.STRIPE_PRICE_ID_CONSUMER_PREMIUM && priceId === process.env.STRIPE_PRICE_ID_CONSUMER_PREMIUM) {
    return "consumer_premium";
  }
  /** Agent Premium (Elite) — check before Agent Pro so distinct price IDs resolve correctly */
  if (process.env.STRIPE_PRICE_ID_AGENT_PREMIUM && priceId === process.env.STRIPE_PRICE_ID_AGENT_PREMIUM) {
    return "agent_pro";
  }
  /** Agent Pro product name → Growth tier */
  if (process.env.STRIPE_PRICE_ID_AGENT_PRO && priceId === process.env.STRIPE_PRICE_ID_AGENT_PRO) {
    return "agent_starter";
  }
  if (process.env.STRIPE_PRICE_ID_AGENT_STARTER && priceId === process.env.STRIPE_PRICE_ID_AGENT_STARTER) {
    return "agent_starter";
  }
  for (const { envKey, plan } of CRM_ENV_TO_PLAN) {
    const v = process.env[envKey];
    if (v && priceId === v) return plan;
  }
  return undefined;
}

export function mapStripePriceToPlan(priceId?: string | null): InternalPlan {
  if (!priceId) return "consumer_free";
  return PRICE_ID_TO_PLAN[priceId] ?? planFromEnv(priceId) ?? "consumer_free";
}

const INTERNAL_PLAN_VALUES: InternalPlan[] = [
  "consumer_free",
  "consumer_premium",
  "agent_starter",
  "agent_pro",
  "crm_starter",
  "crm_pro",
  "crm_premium",
  "crm_signature",
  "crm_team",
];

/**
 * Prefer `internal_plan` on the Stripe Subscription (set by Checkout `subscription_data.metadata`)
 * when the live Price ID is not yet in `PRICE_ID_TO_PLAN` / env — otherwise paid checkouts map to
 * `consumer_free` and never sync `product_entitlements`.
 */
export function resolveInternalPlanFromStripeSubscription(
  priceId: string | null | undefined,
  metadata: { internal_plan?: string | null } | null | undefined
): InternalPlan {
  const raw = String(metadata?.internal_plan ?? "").trim();
  if (raw && INTERNAL_PLAN_VALUES.includes(raw as InternalPlan)) {
    return raw as InternalPlan;
  }
  return mapStripePriceToPlan(priceId ?? null);
}
