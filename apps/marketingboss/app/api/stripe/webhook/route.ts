import { NextResponse } from "next/server";
import { constructWebhookEvent, type CheckoutSession } from "@/lib/stripe";
import { fulfillSession } from "@/lib/fulfill";
import { fulfillInvoice, syncSubscriptionStatus } from "@/lib/subscriptions";

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

  try {
    const obj = event.data.object;
    switch (event.type) {
      case "checkout.session.completed":
        // One-time credit packs only; subscriptions are credited from their
        // paid invoices (invoice.paid) so first-month + renewals share one path.
        if (obj.mode !== "subscription") {
          await fulfillSession(obj as unknown as CheckoutSession);
        }
        break;
      case "invoice.paid":
      case "invoice.payment_succeeded":
        // Idempotent per invoice id — safe if both events fire.
        await fulfillInvoice(obj);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscriptionStatus(obj);
        break;
      default:
        break;
    }
  } catch (e) {
    // Return 500 so Stripe retries — the credit hasn't been applied yet.
    const msg = e instanceof Error ? e.message : "Fulfillment failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
