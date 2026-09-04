import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * RETIRED. Switched an existing feature-tier subscription between monthly and
 * annual by swapping its Stripe price.
 *
 * It is retired because the ladder it swapped within is retired: the annual
 * prices it targeted belong to Stripe products the product no longer sells.
 * The credit ladder has no annual Stripe price yet at all — `annualUsd()`
 * computes the figure and `annualPriceConfigured()` gates the UI on the price
 * existing, precisely so nothing advertises a cadence that cannot be bought.
 *
 * The one live subscription on the old ladder is unaffected: it keeps billing
 * on its own Stripe price whatever this route does. Changing ITS cadence now
 * goes through the Stripe billing portal (`/api/billing/portal`), which edits
 * the subscription directly and does not need our catalogue.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Changing billing cadence here has been retired. Manage an existing subscription from the billing portal.",
      retired: true,
      replacement: "/api/billing/portal",
    },
    { status: 410 },
  );
}
