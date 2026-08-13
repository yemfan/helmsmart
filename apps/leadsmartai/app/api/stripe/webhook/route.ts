import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  markInvoiceFailed,
  markInvoicePaid,
  markSubscriptionCanceled,
  syncStripeSubscription,
} from "@/lib/billing/stripe-sync";
import { stripe } from "@/lib/stripe/server";
import { persistAgentAndProfileFromSubscription } from "@/lib/stripeSubscriptionApply";
import { grantCredits } from "@/lib/credits/ledger";
import { grantMonthlyCreditsForInvoice } from "@/lib/credits/subscriptionCredits";

function customerIdFromSubscription(sub: Stripe.Subscription): string | null {
  const c = sub.customer;
  if (!c) return null;
  return typeof c === "string" ? c : c.id;
}

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { success: false, error: "Missing Stripe signature" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  // Signing secrets are per-endpoint, and this Stripe account has more than one
  // endpoint (CloseBoss + a sibling app). Accept a comma-separated list so the
  // right one wins whichever endpoint delivered the event. Each value is TRIMMED
  // — a stray newline/space from pasting into the dashboard silently breaks the
  // HMAC and looks exactly like a wrong secret (cf. the untrimmed META_APP_SECRET
  // bug). Never log the secret itself; a length+suffix fingerprint is enough to
  // tell which value is deployed.
  const secrets = (process.env.STRIPE_WEBHOOK_SECRET ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (secrets.length === 0) {
    console.error("Stripe webhook: STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ success: false, error: "Webhook not configured" }, { status: 500 });
  }

  let lastErr: unknown = null;
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(body, signature, secret);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (lastErr) {
    console.error(
      "Stripe webhook signature error (tried %d secret(s): %s):",
      secrets.length,
      secrets.map((s) => `len=${s.length}/…${s.slice(-4)}`).join(", "),
      lastErr,
    );
    return NextResponse.json(
      { success: false, error: "Invalid webhook signature" },
      { status: 400 }
    );
  }
  event = event!;

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.mode === "subscription" && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string, {
            expand: ["customer"],
          });
          const userId = (session.metadata?.user_id as string | undefined) ?? null;
          await persistAgentAndProfileFromSubscription({
            userId: userId ?? (subscription.metadata?.user_id as string | undefined) ?? null,
            customerId: (session.customer as string | null) ?? customerIdFromSubscription(subscription),
            subscriptionId: subscription.id,
            subscription,
            checkoutPlanMeta: session.metadata?.plan ?? null,
          });
          await syncStripeSubscription(subscription);
        } else if (session.mode === "payment" && session.metadata?.kind === "credit_topup") {
          // One-time credit top-up — grant the purchased credits, idempotent on
          // the session id so a re-delivered webhook can't double-credit.
          const userId = session.metadata.user_id as string | undefined;
          const credits = Number.parseInt(session.metadata.credits ?? "", 10);
          if (userId && Number.isFinite(credits) && credits > 0) {
            await grantCredits(userId, credits, "topup", session.id);
          }
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;

        const fullSubscription = await stripe.subscriptions.retrieve(subscription.id, {
          expand: ["customer"],
        });

        await persistAgentAndProfileFromSubscription({
          userId: (fullSubscription.metadata?.user_id as string | undefined) ?? null,
          customerId: customerIdFromSubscription(fullSubscription),
          subscriptionId: fullSubscription.id,
          subscription: fullSubscription,
          checkoutPlanMeta: fullSubscription.metadata?.plan ?? null,
        });

        await syncStripeSubscription(fullSubscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await persistAgentAndProfileFromSubscription({
          userId: (subscription.metadata?.user_id as string | undefined) ?? null,
          customerId: customerIdFromSubscription(subscription),
          subscriptionId: subscription.id,
          subscription,
          checkoutPlanMeta: null,
        });
        await markSubscriptionCanceled(subscription.id);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await markInvoiceFailed(invoice);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        await markInvoicePaid(invoice);
        // Grant the plan's monthly credits for this billing period (first
        // invoice + every renewal), idempotent on the invoice id.
        await grantMonthlyCreditsForInvoice(invoice);
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
    return NextResponse.json(
      { success: false, error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
