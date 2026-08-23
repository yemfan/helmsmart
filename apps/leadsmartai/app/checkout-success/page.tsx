import { redirect } from "next/navigation";
import type Stripe from "stripe";
import {
  mapStripePriceToPlan,
  resolveInternalPlanFromStripeSubscription,
} from "@/lib/billing/stripe-plan-map";
import { syncStripeSubscription } from "@/lib/billing/stripe-sync";
import { stripe } from "@/lib/stripe";
import { supabaseServerClient } from "@/lib/supabaseServerClient";
import {
  checkoutSuccessShouldSyncSubscription,
  persistAgentAndProfileFromSubscription,
} from "@/lib/stripeSubscriptionApply";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.checkoutSuccess.title", { ns: "web_marketing" });
  const description = t("routeMeta.checkoutSuccess.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["checkout", "success", "subscription"],
  robots: { index: false },
};
}

/**
 * Stripe `success_url` lands here first. We sync subscription from Stripe immediately so
 * `/dashboard` gating (user_profiles.subscription_status) does not race the webhook.
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams?: Promise<{ session_id?: string; product?: string }>;
}) {
  const sp = searchParams != null ? await searchParams : {};
  const product = String(sp.product ?? "").trim();
  const billingBase = product === "crm" ? "/dashboard/billing" : "/agent/pricing";
  const sessionId = String(sp.session_id ?? "").trim();
  if (!sessionId) {
    redirect(`${billingBase}?checkout_error=missing_session`);
  }

  const supabase = supabaseServerClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    redirect(
      `/login?redirect=${encodeURIComponent(`/checkout-success?session_id=${encodeURIComponent(sessionId)}`)}`
    );
  }
  const user = userData.user;

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    redirect(`${billingBase}?checkout_error=invalid_session`);
  }

  const rawSub = session.subscription;
  const subId =
    typeof rawSub === "string"
      ? rawSub
      : rawSub && typeof (rawSub as Stripe.Subscription).id === "string"
        ? (rawSub as Stripe.Subscription).id
        : null;

  if (!subId) {
    redirect(`${billingBase}?checkout_error=no_subscription`);
  }

  const subscription = await stripe.subscriptions.retrieve(subId);

  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const internalPlanFromPrice = mapStripePriceToPlan(priceId);
  const internalPlanResolved = resolveInternalPlanFromStripeSubscription(priceId, subscription.metadata);

  console.info("[checkout-success] Stripe snapshot", {
    checkoutSessionId: session.id,
    sessionMode: session.mode,
    paymentStatus: session.payment_status,
    paymentStatusDetail:
      session.payment_status === "paid"
        ? "paid — card or other method succeeded"
        : session.payment_status === "no_payment_required"
          ? "no_payment_required — e.g. trial or 100% discount"
          : session.payment_status === "unpaid"
            ? "unpaid — may still be OK if subscription is active/trialing (see subscriptionStatus)"
            : session.payment_status,
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    subscriptionStatusMeansPaid:
      subscription.status === "active" || subscription.status === "trialing",
    priceId,
    internalPlanFromPriceOnly: internalPlanFromPrice,
    internalPlanResolvedForSync: internalPlanResolved,
    sessionMetadata: session.metadata ?? {},
    subscriptionMetadata: subscription.metadata ?? {},
    shouldSyncLegacyProfiles: checkoutSuccessShouldSyncSubscription({
      paymentStatus: session.payment_status,
      subscriptionStatus: subscription.status,
    }),
    authUserId: user.id,
  });

  const metaUserId =
    (session.metadata?.user_id as string | undefined) ??
    (subscription.metadata?.user_id as string | undefined) ??
    null;

  if (!metaUserId) {
    redirect(`${billingBase}?checkout_error=no_metadata`);
  }
  if (metaUserId !== user.id) {
    redirect(`${billingBase}?checkout_error=session_user_mismatch`);
  }

  if (session.mode !== "subscription") {
    redirect("/dashboard");
  }

  if (
    !checkoutSuccessShouldSyncSubscription({
      paymentStatus: session.payment_status,
      subscriptionStatus: subscription.status,
    })
  ) {
    redirect(`${billingBase}?checkout_error=unpaid`);
  }

  try {
    await persistAgentAndProfileFromSubscription({
      userId: user.id,
      customerId: (session.customer as string | null) ?? null,
      subscriptionId: subscription.id,
      subscription,
      checkoutPlanMeta: session.metadata?.plan ?? null,
    });
    console.info("[checkout-success] persistAgentAndProfileFromSubscription ok", {
      subscriptionId: subscription.id,
    });

    /**
     * Must run here (not only via webhook): entitlements + `billing_subscriptions` are updated
     * by `syncStripeSubscription`. Without this, the user can land on the dashboard before the
     * webhook fires and still see the upgrade modal.
     */
    await syncStripeSubscription(subscription);
    console.info("[checkout-success] syncStripeSubscription ok (billing_subscriptions + entitlements)", {
      subscriptionId: subscription.id,
      internalPlan: internalPlanResolved,
    });
  } catch (e) {
    console.error("[checkout-success] persist or billing sync failed", e);
    redirect(`${billingBase}?checkout_error=sync_failed`);
  }

  redirect(product === "crm" ? "/dashboard/billing?checkout=success" : "/dashboard?checkout=success");
}
