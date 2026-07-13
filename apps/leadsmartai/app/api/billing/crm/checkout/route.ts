import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { getUserFromRequest } from "@/lib/authFromRequest";
import { getPaidSubscriptionEligibility } from "@/lib/paidSubscriptionEligibility";
import {
  PLANS,
  type BillingCadence,
  type PlanSlug,
} from "@/lib/billing/plans";
import {
  getCrmStripePriceId,
  internalPlanForCrmSlug,
} from "@/lib/billing/crmStripePrices";

export const runtime = "nodejs";

type Body = {
  /** CRM tier slug — `starter` rejected because it's the free tier. */
  slug: PlanSlug;
  /** Billing cadence — `monthly` (default) or `annual`. */
  cadence?: BillingCadence;
  /** Opt into a trial period; the trial-days count comes from env. */
  with_trial?: boolean;
};

const PRO_ONLY_MSG =
  "Paid plans are for licensed agents, brokers, and real estate teams. Sign up with a professional account or contact support.";

function isPlanSlug(v: unknown): v is PlanSlug {
  return v === "starter" || v === "pro" || v === "premium" || v === "signature" || v === "team";
}

function isBillingCadence(v: unknown): v is BillingCadence {
  return v === "monthly" || v === "annual";
}

/**
 * POST /api/billing/crm/checkout
 *
 * v2.0 CRM-tier checkout. Accepts `{ slug, cadence }` and creates a
 * Stripe Checkout session for the matching (slug, cadence) Price ID.
 * The subscription metadata carries `internal_plan` + `billing_cadence`
 * so the webhook resolves the right tier and writes through to both
 * `billing_subscriptions` and `subscriptions.plan` + `billing_cadence`.
 *
 * Differs from `/api/create-checkout-session` (which is the legacy
 * "pro" | "premium" agent SKU flow) — that route doesn't know about
 * the 5-tier CRM ladder or annual cadence.
 */
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
    if (!isPlanSlug(body.slug)) {
      return NextResponse.json(
        { error: "Invalid slug. Expected one of: pro, premium, signature, team." },
        { status: 400 }
      );
    }
    if (body.slug === "starter") {
      return NextResponse.json(
        { error: "Starter is the free tier — no checkout required." },
        { status: 400 }
      );
    }
    if (PLANS[body.slug].contactSales) {
      return NextResponse.json(
        {
          error: "The Team plan is sales-assisted. Please contact us to get set up.",
          contactSales: true,
          contactUrl: "/contact?topic=team",
        },
        { status: 400 }
      );
    }

    const cadence: BillingCadence = isBillingCadence(body.cadence) ? body.cadence : "monthly";
    const slug: PlanSlug = body.slug;

    // Validate the cadence is offered for this tier (catalog has the answer).
    const def = PLANS[slug];
    if (cadence === "annual" && def.annualPrice == null) {
      return NextResponse.json(
        { error: `Annual cadence not offered for ${slug}.` },
        { status: 400 }
      );
    }

    let price: string;
    try {
      price = getCrmStripePriceId(slug, cadence);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe price lookup failed";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Stripe Price sanity check — fail loudly if misconfigured rather than
    // silently dropping the buyer on the wrong product.
    try {
      const priceRow = await stripe.prices.retrieve(price);
      if (!priceRow.active) {
        return NextResponse.json(
          {
            error:
              "This Stripe price is inactive. Activate it in Stripe Dashboard → Products, or update the STRIPE_PRICE_ID_* env var.",
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
      const expectedInterval = cadence === "annual" ? "year" : "month";
      if (priceRow.recurring?.interval !== expectedInterval) {
        return NextResponse.json(
          {
            error: `Stripe price interval (${priceRow.recurring?.interval}) does not match cadence (${cadence}). Check env var wiring.`,
          },
          { status: 400 }
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid Stripe price";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const trialDays = Number(
      process.env.STRIPE_AGENT_TRIAL_DAYS ?? process.env.STRIPE_TRIAL_DAYS ?? 14
    );
    const withTrial = Boolean(body.with_trial) && Number.isFinite(trialDays) && trialDays > 0;

    const origin = new URL(req.url).origin;
    const cancelUrl = withTrial
      ? `${origin}/agent/pricing?trial_checkout=1&canceled=1`
      : `${origin}/agent/pricing?checkout_canceled=1`;

    const internalPlan = internalPlanForCrmSlug(slug);

    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: {
        user_id: user.id,
        plan: slug,
        internal_plan: internalPlan,
        billing_cadence: cadence,
      },
    };
    if (withTrial) {
      subscriptionData.trial_period_days = trialDays;
    }

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
      // Required CA/NY auto-renewal disclosure: surface the cadence and
      // first-charge amount on the Stripe Checkout summary. The
      // checkout itself acts as the affirmative-consent surface.
      custom_text: {
        submit: {
          message:
            cadence === "annual"
              ? `You'll be charged $${def.annualPrice} today and your subscription will auto-renew annually until canceled. Cancel anytime from your account → Billing.`
              : `You'll be charged $${def.price} today and your subscription will auto-renew monthly until canceled. Cancel anytime from your account → Billing.`,
        },
      },
      metadata: {
        user_id: user.id,
        plan: slug,
        internal_plan: internalPlan,
        billing_cadence: cadence,
        ...(withTrial ? { trial_checkout: "1" } : {}),
      },
    });

    return NextResponse.json({ url: session.url, success: true, ok: true });
  } catch (e: unknown) {
    console.error("crm checkout error", e);
    const msg = String(e instanceof Error ? e.message : "Server error");
    const isConfig =
      msg.includes("STRIPE_PRICE_ID") ||
      msg.includes("Price ID") ||
      /No such price.*prod_/.test(msg);
    const friendly =
      /No such price.*prod_/.test(msg) || msg.includes("prod_")
        ? "Stripe is configured with a Product ID (prod_…) instead of a Price ID (price_…). Use the Price ID from Stripe → Products → Pricing."
        : msg;
    return NextResponse.json({ error: friendly }, { status: isConfig ? 400 : 500 });
  }
}
