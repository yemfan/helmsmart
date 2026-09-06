import { redirect } from "next/navigation";

/**
 * Retired storefront — redirects to /plans.
 *
 * This page sold a fifth price list: Starter $0 / Pro $79 / Premium $199 /
 * Team Custom, through `/api/create-checkout-session`. None of it matched the
 * catalogue in `lib/credits/pricing.ts` — the live ladder is Free / Solo $79 /
 * Pro $159 / Premium $299 / Signature $399 — and "$199" was a price this
 * product does not sell at all.
 *
 * The tell was already in this file: its JSON-LD was built from CREDIT_TIERS
 * while the cards underneath rendered `web_pricing.json`. The structured data
 * search engines read and the prices a visitor read had drifted apart.
 *
 * Kept as a redirect rather than deleted, the same way /agent/pricing was:
 * eleven places link here and it sat in the sitemap, so a 404 would throw away
 * ranking a redirect folds into /plans instead.
 */
export const dynamic = "force-dynamic";

export default function RetiredConsumerPricingPage() {
  redirect("/plans");
}
