import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { getUserFromRequest } from "@/lib/authFromRequest";
import { getPaidSubscriptionEligibility } from "@/lib/paidSubscriptionEligibility";
import {
  getStripePriceIdForAgentPlan,
  getStripePriceIdForPlan,
} from "@/lib/stripePriceIds";

type Body = {
  plan: "pro" | "premium";
  with_trial?: boolean;
  /** Where to send the user if they cancel Checkout (default: consumer `/pricing`). */
  cancel_surface?: "consumer" | "agent";
};

const PRO_ONLY_MSG =
  "Paid plans are for licensed agents, brokers, and real estate teams. Sign up with a professional account or contact support.";

export async function POST(req: Request) {
  try {
    const user = await getUserFromRequest(req);
    if (!user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const elig = await getPaidSubscriptionEligibility(user.id);
    if (!elig.allowed) {
      return NextResponse.json({ error: PRO_ONLY_MSG }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    if (body.plan !== "pro" && body.plan !== "premium") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const isAgentSurface = body.cancel_surface === "agent";

    /*
     * NO TRIAL, on either surface.
     *
     * This route used to open a 14-day trial for the agent surface and a 7-day
     * one elsewhere, defaulted in code — `STRIPE_AGENT_TRIAL_DAYS ?? 14`. Two
     * things were wrong with that. The credit ladder
     * (`/api/stripe/checkout`) never had a trial, so the same product sold two
     * different offers depending on which page you came in through. And an
     * env-var switch means an unset variable silently reinstates a fortnight
     * of free product — the default was the generous direction, which is the
     * wrong way for a default to fail.
     *
     * The decision is that the FREE PLAN is the trial: it never expires, and
     * an upgrade is charged straight away. `FREE_TIER` in lib/credits/pricing
     * has said so for a while ("PERMANENT, not a trial"); this makes the
     * checkout agree.
     *
     * `with_trial` in the request body is now ignored rather than removed —
     * older clients still post it, and rejecting the field would fail their
     * checkout instead of just charging them correctly.
     */

    const price = isAgentSurface
      ? getStripePriceIdForAgentPlan(body.plan)
      : getStripePriceIdForPlan(body.plan);

    try {
      const priceRow = await stripe.prices.retrieve(price);
      if (!priceRow.active) {
        return NextResponse.json(
          {
            error:
              "This Stripe price is inactive. In Dashboard → Products, activate the price or update STRIPE_PRICE_ID_* env vars.",
          },
          { status: 400 }
        );
      }
      if (priceRow.type !== "recurring") {
        return NextResponse.json(
          { error: "Stripe price must be recurring for subscription checkout." },
          { status: 400 }
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid Stripe price";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const origin = new URL(req.url).origin;
    const cancelBase =
      body.cancel_surface === "agent" ? `${origin}/agent/pricing` : `${origin}/pricing`;
    const cancelUrl = `${cancelBase}?checkout_canceled=1`;

    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: {
        user_id: user.id,
        plan: body.plan,
        ...(isAgentSurface
          ? {
              internal_plan: body.plan === "premium" ? "agent_pro" : "agent_starter",
            }
          : {}),
      },
    };
    const session = await stripe.checkout.sessions.create({
      ui_mode: "hosted",
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: user.email,
      client_reference_id: user.id.slice(0, 200),
      line_items: [{ price, quantity: 1 }],
      success_url: `${origin}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      subscription_data: subscriptionData,
      metadata: {
        user_id: user.id,
        plan: body.plan,
      },
    });

    return NextResponse.json({ url: session.url, success: true, ok: true });
  } catch (e: any) {
    console.error("create-checkout-session error", e);
    const msg = String(e?.message ?? "Server error");
    const isConfig =
      msg.includes("STRIPE_PRICE_ID") ||
      msg.includes("Price ID") ||
      /No such price.*prod_/.test(msg);
    const friendly =
      /No such price.*prod_/.test(msg) || msg.includes("prod_")
        ? "Stripe is configured with a Product ID (prod_…) instead of a Price ID (price_…). Set STRIPE_PRICE_ID_PRO to the Price ID from Stripe → Products → Pricing."
        : msg;
    return NextResponse.json({ error: friendly }, { status: isConfig ? 400 : 500 });
  }
}

