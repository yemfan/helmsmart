import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CheckoutSession } from "@/lib/stripe";

/**
 * Credit a buyer for a paid Checkout Session — the single fulfillment path used
 * by both the webhook and the checkout-success page. Idempotent (keyed by the
 * session id in credit_purchase), so calling it from both never double-credits.
 *
 * Returns the new balance, or null if the session isn't a completed, creditable
 * purchase (unpaid, missing metadata, etc.).
 */
export async function fulfillSession(session: CheckoutSession): Promise<number | null> {
  const userId = session.metadata?.user_id || session.client_reference_id || null;
  const credits = Number.parseInt(session.metadata?.credits ?? "", 10);
  if (session.payment_status !== "paid" || !userId || !Number.isFinite(credits) || credits <= 0) {
    return null;
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("credit_purchase", {
    p_user_id: userId,
    p_credits: credits,
    p_session_id: session.id,
    p_pack: session.metadata?.pack ?? null,
    p_amount_cents: session.amount_total ?? null,
  });
  if (error) throw new Error(error.message);
  return typeof data === "number" ? data : null;
}
