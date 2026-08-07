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

  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("Stripe webhook signature error:", err);
    return NextResponse.json(
      { success: false, error: "Invalid webhook signature" },
      { status: 400 }
    );
  }

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
