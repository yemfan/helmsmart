import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * RETIRED. This endpoint sold the feature-tier ladder (lib/billing/plans.ts):
 * Pro $79 / Premium $199 / Team $299 / Signature $399, on Stripe products
 * separate from the ones the product now bills.
 *
 * The credit ladder replaced it — Solo $79 / Pro $159 / Premium $299 /
 * Signature $399 — and sells through `/api/stripe/checkout`. Both were live at
 * once, so the price a customer saw depended on which page they happened to
 * land on. One prospect was quoted $49 for a plan that charges $159.
 *
 * Answering 410 rather than deleting the file: a 404 from a checkout button
 * reads like a bug in the caller, and a stale page or bookmarked deep link
 * would fail silently. This says what happened.
 *
 * NOT retired: `lib/billing/plans.ts`. It is how an EXISTING subscription is
 * read — `subscriptionAccess` resolves features via `PLANS[sub.plan]` — and a
 * live `crm_signature` subscriber depends on it. Retiring the catalogue as a
 * PRICE LIST is not the same as deleting it as a DICTIONARY.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "This plan catalogue has been retired. Current plans are at /plans, and upgrades run through the Credits page in your dashboard.",
      retired: true,
      replacement: "/api/stripe/checkout",
    },
    { status: 410 },
  );
}
