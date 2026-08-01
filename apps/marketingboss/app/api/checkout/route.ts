import { NextResponse } from "next/server";
import { getPack } from "@/lib/billing";
import { createCheckoutSession, stripeConfigured } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Billing isn't set up yet — check back soon." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const pack = getPack(typeof body.pack === "string" ? body.pack : "");
  if (!pack) return NextResponse.json({ error: "Unknown credit pack." }, { status: 400 });

  const origin = req.headers.get("origin") || new URL(req.url).origin;
  try {
    const session = await createCheckoutSession({
      origin,
      userId: user.id,
      email: user.email ?? undefined,
      pack,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return NextResponse.json({ url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not start checkout.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
