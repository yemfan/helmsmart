import { redirect } from "next/navigation";

import { supabaseServerClient } from "@/lib/supabaseServerClient";

/**
 * Retired storefront for the feature-tier ladder (`lib/billing/plans.ts`).
 *
 * This page sold Pro $79 / Premium $199 / Team $299 / Signature $399 through
 * `/api/billing/crm/checkout`, while `/plans` sold the credit ladder — Solo
 * $79 / Pro $159 / Premium $299 / Signature $399 — through a different Stripe
 * product entirely. Two live price lists on one site, and which one a visitor
 * saw depended on where they landed.
 *
 * `/api/stripe/checkout` has carried a comment since 2026-08-30 saying this
 * catalogue is retired "and its pricing pages now redirect to /plans". The
 * checkout precedence was changed then; the redirect never shipped, so the old
 * storefront kept selling for another five weeks. This is that redirect.
 *
 * Kept as a redirect rather than deleted: roughly ten places link here,
 * including in-dashboard upgrade banners, plus whatever Google has indexed.
 * A permanent redirect fixes all of them at once and folds the old page's
 * ranking into /plans, which a 404 would throw away.
 *
 * `lib/billing/plans.ts` itself stays. It is no longer a price list — it is
 * how an EXISTING subscription is read (`subscriptionAccess` resolves features
 * via `PLANS[sub.plan]`), and production still has a live `crm_signature`
 * subscriber whose entitlements depend on it.
 */
export const dynamic = "force-dynamic";

export default async function RetiredAgentPricingPage() {
  const supabase = supabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /*
   * Signed-in visitors are usually arriving from an in-app "Upgrade" banner,
   * and /plans deliberately has no checkout — it tells you to make an account
   * you already have. Send them where buying actually happens.
   */
  redirect(user ? "/dashboard/credits" : "/plans");
}
