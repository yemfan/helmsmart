import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlan } from "@/lib/billing";
import { createSubscriptionCheckout, stripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Start a recurring subscription Checkout for the given plan. Returns { url }. */
export async function POST(req: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Payments aren't set up yet." }, { status: 503 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { plan?: unknown };
  const plan = typeof body.plan === "string" ? getPlan(body.plan) : undefined;
  if (!plan) return NextResponse.json({ error: "Unknown plan." }, { status: 400 });

  const origin = new URL(req.url).origin;
  try {
    const session = await createSubscriptionCheckout({ origin, userId: user.id, email: user.email ?? undefined, plan });
    if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
    return NextResponse.json({ url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not start checkout.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
