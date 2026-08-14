import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { CREDIT_PACKS, readStripePriceId } from "@/lib/credits/pricing";

// One-time credit top-up checkout (Stripe `mode: "payment"`). The matching
// fulfillment lives in the Stripe webhook (checkout.session.completed →
// grant_credits, idempotent on the session id).
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const supabase = supabaseServerClient();
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;
    const user = userData.user;
    if (!user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { packId?: string };
    const pack = CREDIT_PACKS.find((p) => p.id === body.packId);
    if (!pack) {
      return NextResponse.json({ error: "Unknown credit pack." }, { status: 400 });
    }

    // Price ids are provisioned in Stripe + set as env vars; until then the
    // pack simply isn't buyable (graceful degradation, like every integration
    // here). A malformed value is named explicitly rather than handed to Stripe.
    const resolved = readStripePriceId(pack.priceEnv);
    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: 503 });
    }
    const price = resolved.id;

    const origin = new URL(req.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      line_items: [{ price, quantity: 1 }],
      success_url: `${origin}/dashboard/billing?topup=success`,
      cancel_url: `${origin}/dashboard/billing?topup=canceled`,
      allow_promotion_codes: true,
      metadata: {
        user_id: user.id,
        kind: "credit_topup",
        credits: String(pack.credits),
        pack_id: pack.id,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    console.error("credit topup checkout error", e);
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
