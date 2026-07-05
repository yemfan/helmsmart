import type { InternalPlan } from "@/lib/billing/stripe-plan-map";
import { PLANS, type BillingCadence, type PlanSlug } from "@/lib/billing/plans";

/**
 * Backward-compat env var aliases.
 *
 * The catalog renamed slugs to align with the marketing tiers
 * (Starter Free / Pro $79 / Premium $199 / Signature $399 / Team).
 * The old deployments wired the $99 product to STRIPE_PRICE_ID_ELITE
 * and never had a STRIPE_PRICE_ID_PREMIUM. Keep the lookup forgiving
 * so existing .env.local files keep working — preferred name wins,
 * legacy name is a fallback. Annual env vars have no legacy aliases
 * because they're new in v2.0.
 */
const ENV_VAR_FALLBACKS: Record<string, string> = {
  STRIPE_PRICE_ID_PREMIUM: "STRIPE_PRICE_ID_ELITE",
};

function readEnvWithFallback(envKey: string): string {
  const direct = (process.env[envKey] ?? "").trim();
  if (direct) return direct;
  const fallbackKey = ENV_VAR_FALLBACKS[envKey];
  if (fallbackKey) {
    return (process.env[fallbackKey] ?? "").trim();
  }
  return "";
}

/**
 * Stripe Price ID (`price_…`) for a (CRM tier, cadence) pair. Throws on
 * misconfiguration so checkout fails loudly instead of silently
 * landing the user on the wrong product.
 *
 * Free tiers (Starter) intentionally don't have a Stripe Price ID —
 * calling this with a free slug throws. Callers that handle free
 * separately should branch on `PLANS[slug].stripePriceEnvVar` first.
 *
 * `cadence` defaults to `"monthly"` so legacy callers that don't pass
 * it keep resolving to the monthly Price ID. Pass `"annual"` to look
 * up the yearly SKU.
 */
export function getCrmStripePriceId(
  plan: PlanSlug,
  cadence: BillingCadence = "monthly",
): string {
  const def = PLANS[plan];
  const envKey =
    cadence === "annual" ? def.stripePriceEnvVarAnnual : def.stripePriceEnvVar;

  if (!envKey) {
    if (cadence === "annual" && def.stripePriceEnvVar) {
      throw new Error(
        `Plan "${plan}" does not offer an annual cadence. ` +
          `Pass cadence="monthly" or add stripePriceEnvVarAnnual in PLANS.`,
      );
    }
    throw new Error(
      `Plan "${plan}" is free and has no Stripe Price ID. Branch on PLANS[slug].stripePriceEnvVar before calling getCrmStripePriceId.`,
    );
  }

  const v = readEnvWithFallback(envKey);
  const fallbackKey = ENV_VAR_FALLBACKS[envKey];
  const lookupSummary = fallbackKey ? `${envKey} (or ${fallbackKey})` : envKey;

  if (!v) {
    throw new Error(
      `Missing ${lookupSummary}. Add a recurring ${cadence} Stripe Price ID for the ${plan} CRM plan.`,
    );
  }
  if (v.startsWith("prod_")) {
    throw new Error(
      `${lookupSummary} must be a Price ID (price_…), not a Product ID (prod_…).`,
    );
  }
  if (!v.startsWith("price_")) {
    throw new Error(`${lookupSummary} must start with price_.`);
  }
  return v;
}

/** Slug → InternalPlan, derived from the catalog so additions stay in sync. */
export function internalPlanForCrmSlug(plan: PlanSlug): InternalPlan {
  return PLANS[plan].internalPlan;
}
