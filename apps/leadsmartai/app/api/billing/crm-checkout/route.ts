import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserWithRole } from "@/lib/auth/getCurrentUser";
import { recordUpgradeCheckoutStarted } from "@/lib/funnel/funnelAnalytics";
import { getCrmStripePriceId, internalPlanForCrmSlug } from "@/lib/billing/crmStripePrices";
import { PLANS, type PlanSlug } from "@/lib/billing/plans";
import { stripe } from "@/lib/stripe/server";

/**
 * Valid checkout slugs — paid tiers only. `starter` is the free tier
 * and has no Stripe Price ID (catalog: `stripePriceEnvVar: null`),
 * so it can't go through Stripe Checkout. The free path is handled
 * by the dashboard billing page directly (Starter card renders as
 * "Free — included by default" instead of a Switch button).
 */
const bodySchema = z.object({
  plan: z.enum(["pro", "premium", "team"]),
});

function siteOrigin(req: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  return new URL(req.url).origin;
}

export const runtime = "nodejs";

/**
 * Stripe Checkout for LeadSmart CRM tiers (monthly). Mobile clients should open `url` in the system browser.
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUserWithRole(req);
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!user.email) {
      return NextResponse.json({ ok: false, error: "Account email required for checkout" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid plan", issues: parsed.error.flatten() }, { status: 400 });
    }

    const plan = parsed.data.plan as PlanSlug;
    if (PLANS[plan].contactSales) {
      return NextResponse.json(
        {
          ok: false,
          error: "The Team plan is sales-assisted. Please contact us to get set up.",
          contactSales: true,
          contactUrl: "/contact?topic=team",
        },
        { status: 400 }
      );
    }
    const priceId = getCrmStripePriceId(plan);
    const internalPlan = internalPlanForCrmSlug(plan);
    const origin = siteOrigin(req);

    try {
      const priceRow = await stripe.prices.retrieve(priceId);
      if (!priceRow.active) {
        return NextResponse.json({ ok: false, error: "This Stripe price is inactive." }, { status: 400 });
      }
      if (priceRow.type !== "recurring") {
        return NextResponse.json({ ok: false, error: "Checkout requires a recurring subscription price." }, { status: 400 });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid Stripe price";
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      ui_mode: "hosted",
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: user.email,
      client_reference_id: user.id.slice(0, 200),
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/checkout-success?session_id={CHECKOUT_SESSION_ID}&product=crm`,
      cancel_url: `${origin}/dashboard/billing?canceled=1`,
      allow_promotion_codes: true,
      metadata: {
        user_id: user.id,
        email: user.email,
        internal_plan: internalPlan,
        crm_plan: plan,
        product: "leadsmart_crm",
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          internal_plan: internalPlan,
          crm_plan: plan,
          product: "leadsmart_crm",
        },
      },
    });

    void recordUpgradeCheckoutStarted(user.id, plan);

    return NextResponse.json({ ok: true, url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("POST /api/billing/crm-checkout", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
