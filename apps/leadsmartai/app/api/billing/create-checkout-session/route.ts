import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserWithRole } from "@/lib/auth/getCurrentUser";
import { mapStripePriceToPlan } from "@/lib/billing/stripe-plan-map";
import { stripe } from "@/lib/stripe/server";

const createCheckoutSchema = z.object({
  priceId: z.string().min(1),
});

function siteOrigin(req: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  return new URL(req.url).origin;
}

/**
 * Stripe Checkout with an explicit **Price ID** (e.g. Growth / Elite agent products).
 * Success lands on existing `/checkout-success` so subscription sync matches other flows.
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUserWithRole(req);

    if (!user) {
      return NextResponse.json(
        { success: false, ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (!user.email) {
      return NextResponse.json(
        { success: false, ok: false, error: "Account email required for checkout" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = createCheckoutSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          ok: false,
          error: "Invalid payload",
          issues: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const origin = siteOrigin(req);
    const internalPlan = mapStripePriceToPlan(parsed.data.priceId);
    const isConsumerPremium = internalPlan === "consumer_premium";
    const isAgentPaid =
      internalPlan === "agent_starter" || internalPlan === "agent_pro";
    const isLoanBroker = internalPlan === "loan_broker_pro";
    const productKey = isConsumerPremium
      ? "propertytools_consumer"
      : isAgentPaid
        ? "leadsmart_agent"
        : isLoanBroker
          ? "loan_broker"
          : "stripe_subscription";

    const checkoutProduct =
      isConsumerPremium ? "consumer" : isLoanBroker ? "loan_broker" : "agent";
    const cancelUrl = isConsumerPremium
      ? `${origin}/pricing`
      : `${origin}/agent/pricing`;

    try {
      const priceRow = await stripe.prices.retrieve(parsed.data.priceId);
      if (!priceRow.active) {
        return NextResponse.json(
          {
            success: false,
            ok: false,
            error:
              "This Stripe price is inactive. Activate it in Stripe Dashboard or update your price ID env vars.",
          },
          { status: 400 }
        );
      }
      if (priceRow.type !== "recurring") {
        return NextResponse.json(
          {
            success: false,
            ok: false,
            error: "Checkout requires a recurring subscription price.",
          },
          { status: 400 }
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid Stripe price";
      return NextResponse.json({ success: false, ok: false, error: msg }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      ui_mode: "hosted",
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: user.email,
      client_reference_id: user.id.slice(0, 200),
      line_items: [
        {
          price: parsed.data.priceId,
          quantity: 1,
        },
      ],
      success_url: `${origin}/checkout-success?session_id={CHECKOUT_SESSION_ID}&product=${checkoutProduct}`,
      cancel_url: cancelUrl,
      metadata: {
        user_id: user.id,
        email: user.email,
        role: user.role ?? "",
        product: productKey,
        internal_plan: internalPlan,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          product: productKey,
          internal_plan: internalPlan,
        },
      },
    });

    return NextResponse.json({
      success: true,
      ok: true,
      url: session.url,
    });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Failed to create checkout session";
    return NextResponse.json(
      { success: false, ok: false, error: message },
      { status: 500 }
    );
  }
}
