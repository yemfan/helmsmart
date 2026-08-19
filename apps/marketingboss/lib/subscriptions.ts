import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { retrieveSubscription, type StripeSubscription } from "@/lib/stripe";

/**
 * Subscription fulfillment (webhook side). Monthly credits are granted per PAID
 * INVOICE and deduped by invoice id in the DB (grant_subscription_credits), so a
 * webhook retry or overlapping delivery can never double-grant. The user + plan
 * + credit count are stamped on the Stripe SUBSCRIPTION's metadata (and echoed
 * onto each of its invoices), so an invoice maps back to a user without
 * depending on event ordering.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

/** Metadata we stamp on the subscription at checkout: who to credit, and how much. */
type SubMeta = { userId: string | null; plan: string | null; credits: number };

function readMeta(meta: Record<string, string> | null | undefined): SubMeta {
  const m = meta ?? {};
  return {
    userId: m.user_id || null,
    plan: m.plan || null,
    credits: Number.parseInt(m.credits ?? "", 10),
  };
}

/**
 * The subscription an invoice belongs to. Stripe moved this off the invoice's
 * top level in API 2025-04-30.basil; it now lives under
 * `parent.subscription_details`, which also carries the subscription metadata.
 * Both shapes are read so the webhook works regardless of the account's version.
 */
function invoiceSubscription(invoice: Record<string, unknown>): {
  id: string | null;
  meta: SubMeta | null;
} {
  const legacy = invoice.subscription;
  if (typeof legacy === "string") return { id: legacy, meta: null };

  const parent = invoice.parent as { subscription_details?: unknown } | null | undefined;
  const details = parent?.subscription_details as
    | { subscription?: unknown; metadata?: Record<string, string> | null }
    | undefined;
  const id = typeof details?.subscription === "string" ? details.subscription : null;
  return { id, meta: details?.metadata ? readMeta(details.metadata) : null };
}

/**
 * A subscription's period end. Also moved in basil+ — off the subscription and
 * onto each subscription item — so fall back to the first item.
 */
function periodEnd(sub: StripeSubscription): string | null {
  const top = sub.current_period_end;
  const item = sub.items?.data?.[0]?.current_period_end;
  const secs = typeof top === "number" ? top : typeof item === "number" ? item : null;
  return secs === null ? null : new Date(secs * 1000).toISOString();
}

async function upsertSubscriptionRow(
  admin: AdminClient,
  userId: string,
  sub: StripeSubscription,
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
      current_period_end: periodEnd(sub),
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
  const { id: subId, meta: inlineMeta } = invoiceSubscription(invoice);
  if (!invoiceId || !subId) return false; // one-time invoice, not a subscription

  const sub = await retrieveSubscription(subId);
  // The invoice usually carries the metadata inline; the subscription is the
  // fallback (and the source of status/customer/period either way).
  const fromSub = readMeta(sub.metadata);
  const { userId, plan, credits } =
    inlineMeta && inlineMeta.userId ? inlineMeta : fromSub;
  if (!userId || !Number.isFinite(credits) || credits <= 0) {
    // Never fail silently here again: a subscription invoice we cannot map is a
    // customer who paid and got nothing.
    console.warn(
      `[stripe] invoice ${invoiceId} (${subId}) has no usable metadata — no credits granted.`,
    );
    return false;
  }

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
  const sub = subObj as unknown as StripeSubscription;
  const { userId } = readMeta(sub.metadata);
  if (!userId) return;
  const admin = createAdminClient();
  await admin
    .from("subscriptions")
    .update({
      status: typeof sub.status === "string" ? sub.status : null,
      current_period_end: periodEnd(sub),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}
