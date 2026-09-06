import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getPaidSubscriptionEligibility } from "@/lib/paidSubscriptionEligibility";
import { getStripePriceIdForPlan } from "@/lib/stripePriceIds";
import { CREDIT_TIERS, annualPriceEnv, readStripePriceId } from "@/lib/credits/pricing";
import { monthlyCreditsForPlan } from "@/lib/credits/subscriptionCredits";
import type { BillingCadence } from "@/lib/credits/pricing";

// The usage-model plans (Starter/Growth/Scale) replace the old Pro/Premium
// tiers; legacy slugs still resolve (nearest plan) so nothing breaks mid-cutover.
type Body = { plan: string; cadence?: BillingCadence };

const PRO_ONLY_MSG =
  "Paid plans are for licensed agents, brokers, and real estate teams. Sign up with a professional account or contact support.";

/** Subscription states we treat as "already subscribed" for plan changes. */
const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

/**
 * The user's current live subscription, if any. Looked up through the Stripe
 * customer rather than a local column — the local subscription fields have
 * proven to drift, and billing a customer twice is the expensive failure here.
 */
async function findActiveSubscription(userId: string) {
  const { data } = await supabaseAdmin
    .from("leadsmart_users")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  const customerId = (data as { stripe_customer_id?: string | null } | null)?.stripe_customer_id;
  if (!customerId) return null;

  let subs;
  try {
    subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
  } catch (e) {
    // A stored customer id from the OTHER Stripe mode does not exist under the
    // current key, and Stripe answers `resource_missing` rather than an empty
    // list. Unhandled, that surfaced to the user as the raw string
    // "No such customer: 'cus_...'" with a 500 — blocking anyone who had ever
    // touched billing in test mode from subscribing for real.
    //
    // A customer that does not exist here cannot have a subscription here, so
    // treating it as "not subscribed" is correct: Checkout below identifies the
    // buyer by `customer_email` and Stripe creates a fresh customer.
    //
    // Deliberately narrow. Any other error (rate limit, outage) is re-thrown,
    // because concluding "no subscription" from a failed lookup would start a
    // SECOND subscription and bill an existing customer twice — the expensive
    // failure this function exists to prevent.
    const code = (e as { code?: string } | null)?.code;
    if (code !== "resource_missing") throw e;
    console.warn("stripe checkout: stored customer %s not found in this mode", customerId);
    return null;
  }
  return subs.data.find((s) => LIVE_STATUSES.has(s.status)) ?? null;
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseServerClient();
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;
    const user = userData.user;
    if (!user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const elig = await getPaidSubscriptionEligibility(user.id);
    if (!elig.allowed) {
      return NextResponse.json({ error: PRO_ONLY_MSG }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const plan = typeof body.plan === "string" ? body.plan : "";
    const tier = CREDIT_TIERS.find((t) => t.id === plan);

    // New credit plans resolve their price from env; legacy pro/premium still work.
    //
    // PRECEDENCE MATTERS AND CHANGED ON 2026-08-30. The credit ladder gained
    // tiers literally named "pro" and "premium", and the CREDIT_TIERS lookup
    // above runs first — so those two strings now resolve to the CREDIT plans
    // ($159/2,000 and $299/4,000), and the legacy branch below is unreachable
    // for them. That is intended: the feature-tier catalog those ids belonged
    // to is retired, and its pricing pages now redirect to /plans.
    //
    // It is spelled out because the legacy branch still LOOKS live. Anything
    // that genuinely needs the old Agent Pro price must not ask for "pro".
    /*
     * Cadence picks a DIFFERENT Stripe price, and an unknown value means
     * monthly. It refuses rather than falling back, because the failure it
     * replaces was silent: the funnel offered "save 17%" and $3,990 billed
     * yearly, and checkout resolved `tier.priceEnv` — the monthly price —
     * unconditionally. Falling back here would keep that behaviour and bill a
     * customer $4,788 for the year they were quoted $3,990 for.
     */
    const cadence: BillingCadence = body.cadence === "annual" ? "annual" : "monthly";

    let price: string | undefined;
    if (tier) {
      const priceEnv = cadence === "annual" ? annualPriceEnv(tier.id) : tier.priceEnv;
      const resolved = readStripePriceId(priceEnv);
      if ("error" in resolved) {
        return NextResponse.json(
          {
            error:
              cadence === "annual"
                ? "Annual billing isn't available for this plan yet. Choose monthly, or contact support."
                : resolved.error,
          },
          { status: 503 },
        );
      }
      price = resolved.id;
    } else if (plan === "pro" || plan === "premium") {
      price = getStripePriceIdForPlan(plan);
    }

    if (!price) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    /*
     * Signature's one-time setup fee. It has been on /plans since 2026-09-03
     * and, until now, never reached Stripe: checkout carried only the
     * recurring price, so every Signature buyer got the $499 specialist
     * onboarding for free. It refuses rather than falling back — selling the
     * plan without the fee IS the bug, not a degraded mode — and /plans hides
     * the button for the same reason (see setupFeeConfigured).
     */
    let setupPrice: string | undefined;
    if (tier?.setupFeeUsd && tier.setupFeePriceEnv) {
      const resolved = readStripePriceId(tier.setupFeePriceEnv);
      if ("error" in resolved) {
        return NextResponse.json(
          { error: "This plan's setup isn't available online yet. Contact support and we'll get you started." },
          { status: 503 },
        );
      }
      setupPrice = resolved.id;
    }

    // Monthly credit allotment carried in the subscription metadata so each
    // paid invoice (first + renewals) grants the right number of credits.
    const credits = tier ? tier.monthlyCredits : monthlyCreditsForPlan(plan);
    const origin = new URL(req.url).origin;

    // ── Already subscribed? Change the plan instead of starting a second one ──
    // Sending an existing subscriber through Checkout would create a SECOND
    // live subscription (billed twice) and charge the full new price rather
    // than the difference. Switching the existing subscription's price with
    // proration bills only the balance for the rest of the period.
    const existing = await findActiveSubscription(user.id);
    if (existing) {
      const item = existing.items.data[0];
      if (item?.price?.id === price) {
        return NextResponse.json({ error: "You're already on that plan." }, { status: 400 });
      }

      const prevCredits = Number.parseInt(existing.metadata?.credits ?? "", 10);

      // The setup fee rides on the proration invoice: a pending invoice item on
      // the customer is swept into the next invoice, and `always_invoice`
      // below creates that invoice immediately.
      if (setupPrice) {
        const customerId =
          typeof existing.customer === "string" ? existing.customer : existing.customer.id;
        await stripe.invoiceItems.create({
          customer: customerId,
          subscription: existing.id,
          // 2025-08-27.basil: the price moved under `pricing`.
          pricing: { price: setupPrice },
          quantity: 1,
          description: `${tier?.name ?? plan} one-time setup with a specialist`,
        });
      }

      const updated = await stripe.subscriptions.update(existing.id, {
        items: [{ id: item.id, price }],
        // Bill (or credit) the difference for the remainder of the period now.
        proration_behavior: "always_invoice",
        payment_behavior: "allow_incomplete",
        metadata: {
          user_id: user.id,
          plan,
          credits: String(credits),
          // Read by grantMonthlyCreditsForInvoice to size the grant: one annual
          // invoice has to deliver twelve months of credits.
          cadence,
          // Lets the webhook grant only the DELTA on the proration invoice,
          // instead of a second full month of credits.
          prev_credits: Number.isFinite(prevCredits) ? String(prevCredits) : "0",
        },
      });

      return NextResponse.json({
        switched: true,
        plan,
        status: updated.status,
        message: `Plan changed — you're only billed the difference for the rest of this period.`,
      });
    }



    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: user.email,
      // A one-time price beside the recurring one is billed on the first
      // invoice only — that is the setup fee.
      line_items: setupPrice ? [{ price, quantity: 1 }, { price: setupPrice, quantity: 1 }] : [{ price, quantity: 1 }],
      success_url: `${origin}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?canceled=true`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan,
          credits: String(credits),
          cadence,
        },
      },
      metadata: {
        user_id: user.id,
        plan,
        credits: String(credits),
        cadence,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    // Every case we can explain returns above with its own message. What reaches
    // here is unexpected, and raw Stripe/Postgres text ("No such customer:
    // 'cus_...'") tells a customer nothing they can act on while leaking
    // internal ids. Log the detail, show a person a next step.
    console.error("stripe checkout error", e);
    return NextResponse.json(
      { error: "We couldn't start checkout just now. Please try again, or contact support if it keeps happening." },
      { status: 500 }
    );
  }
}

