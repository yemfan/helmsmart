import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { getPaidSubscriptionEligibility } from "@/lib/paidSubscriptionEligibility";
import { getStripePriceIdForPlan } from "@/lib/stripePriceIds";
import { CREDIT_TIERS } from "@/lib/credits/pricing";
import { monthlyCreditsForPlan } from "@/lib/credits/subscriptionCredits";

// The usage-model plans (Starter/Growth/Scale) replace the old Pro/Premium
// tiers; legacy slugs still resolve (nearest plan) so nothing breaks mid-cutover.
type Body = { plan: string };

const PRO_ONLY_MSG =
  "Paid plans are for licensed agents, brokers, and real estate teams. Sign up with a professional account or contact support.";

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
    let price: string | undefined;
    if (tier) price = process.env[tier.priceEnv]?.trim();
    else if (plan === "pro" || plan === "premium") price = getStripePriceIdForPlan(plan);

    if (!price) {
      return NextResponse.json(
        { error: tier ? `That plan isn't set up yet (missing ${tier.priceEnv}).` : "Invalid plan" },
        { status: tier ? 503 : 400 },
      );
    }

    // Monthly credit allotment carried in the subscription metadata so each
    // paid invoice (first + renewals) grants the right number of credits.
    const credits = tier ? tier.monthlyCredits : monthlyCreditsForPlan(plan);
    const origin = new URL(req.url).origin;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: user.email,
      line_items: [{ price, quantity: 1 }],
      success_url: `${origin}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?canceled=true`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan,
          credits: String(credits),
        },
      },
      metadata: {
        user_id: user.id,
        plan,
        credits: String(credits),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("stripe checkout error", e);
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

