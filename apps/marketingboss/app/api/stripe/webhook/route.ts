import { NextResponse } from "next/server";
import { constructWebhookEvent } from "@/lib/stripe";
import { fulfillSession } from "@/lib/fulfill";

// Stripe webhooks need the raw body + Node crypto to verify the signature.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  const payload = await req.text();
  const sig = req.headers.get("stripe-signature");

  let event: ReturnType<typeof constructWebhookEvent>;
  try {
    event = constructWebhookEvent(payload, sig, secret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid signature.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    try {
      await fulfillSession(event.data.object);
    } catch (e) {
      // Return 500 so Stripe retries — the credit hasn't been applied yet.
      const msg = e instanceof Error ? e.message : "Fulfillment failed.";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
