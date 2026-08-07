import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { retrieveSubscription } from "@/lib/stripe";

/**
 * Subscription fulfillment (webhook side). Monthly credits are granted per PAID
 * INVOICE and deduped by invoice id in the DB (grant_subscription_credits), so a
 * webhook retry or overlapping delivery can never double-grant. The user + plan
 * + credit count live on the Stripe SUBSCRIPTION's metadata, so an invoice maps
 * back to a user without depending on event ordering.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

async function upsertSubscriptionRow(
  admin: AdminClient,
  userId: string,
  sub: { id: string; customer?: string | null; status?: string; current_period_end?: number | null },
  plan: string | null,
  credits: number | null,
): Promise<void> {
  await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : null,
      stripe_subscription_id: sub.id,
      plan,
      status: sub.status ?? null,
      credits_per_month: credits,
      current_period_end:
        typeof sub.current_period_end === "number"
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

/**
 * Fulfill a paid subscription invoice: grant the plan's monthly credits
 * (idempotent per invoice) and refresh the subscription row. Returns true when
 * it was a subscription invoice we handled. Throws on a real failure so the
 * webhook returns 500 and Stripe retries.
 */
export async function fulfillInvoice(invoice: Record<string, unknown>): Promise<boolean> {
  const invoiceId = typeof invoice.id === "string" ? invoice.id : null;
  const subId = typeof invoice.subscription === "string" ? invoice.subscription : null;
  if (!invoiceId || !subId) return false; // one-time invoice, not a subscription

  const sub = await retrieveSubscription(subId);
  const userId = sub.metadata?.user_id ?? null;
  const plan = sub.metadata?.plan ?? null;
  const credits = Number.parseInt(sub.metadata?.credits ?? "", 10);
  if (!userId || !Number.isFinite(credits) || credits <= 0) return false;

  const admin = createAdminClient();
  const { error } = await admin.rpc("grant_subscription_credits", {
    p_user: userId,
    p_credits: credits,
    p_invoice: invoiceId,
  });
  if (error) throw new Error(error.message);

  await upsertSubscriptionRow(admin, userId, sub, plan, credits);
  return true;
}

/** Refresh a subscription's status from a customer.subscription.* event. */
export async function syncSubscriptionStatus(subObj: Record<string, unknown>): Promise<void> {
  const meta = (subObj.metadata ?? {}) as Record<string, string>;
  const userId = meta.user_id ?? null;
  if (!userId) return;
  const admin = createAdminClient();
  await admin
    .from("subscriptions")
    .update({
      status: typeof subObj.status === "string" ? subObj.status : null,
      current_period_end:
        typeof subObj.current_period_end === "number"
          ? new Date(subObj.current_period_end * 1000).toISOString()
          : null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}
