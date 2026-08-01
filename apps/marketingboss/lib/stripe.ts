/**
 * Zero-dependency Stripe helpers (REST + node:crypto) — no SDK, so the pnpm
 * lockfile stays untouched. Mirrors how lib/fal.ts talks to fal.ai over fetch.
 *
 * Secrets are read from the environment and never leave the server:
 *   STRIPE_SECRET_KEY      — server key (sk_...), used for Checkout + retrieval
 *   STRIPE_WEBHOOK_SECRET  — signing secret (whsec_...), verifies webhook events
 */
import crypto from "node:crypto";
import type { CreditPack } from "@/lib/billing";

const API = "https://api.stripe.com/v1";

/** True when Stripe is wired up (the secret key is present). */
export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

function key(): string {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) throw new Error("STRIPE_SECRET_KEY is not set.");
  return k;
}

type StripeError = { error?: { message?: string } };

/** A Stripe Checkout Session (only the fields we read). */
export type CheckoutSession = {
  id: string;
  url: string | null;
  payment_status?: string;
  amount_total?: number | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
};

/**
 * Create a hosted Checkout Session for a credit pack. The pack is built inline
 * with price_data (no pre-created Stripe Product). We stamp the buyer + credit
 * count into metadata so fulfillment knows who to credit and by how much.
 *
 * On success Stripe returns the buyer to the Studio (`/?purchased=<session>`),
 * which fulfills the credits and shows a confirmation, ready to create.
 */
export async function createCheckoutSession(opts: {
  origin: string;
  userId: string;
  email?: string;
  pack: CreditPack;
}): Promise<CheckoutSession> {
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", `${opts.origin}/?purchased={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", `${opts.origin}/billing?status=cancel`);
  form.set("client_reference_id", opts.userId);
  if (opts.email) form.set("customer_email", opts.email);
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", "usd");
  form.set("line_items[0][price_data][unit_amount]", String(opts.pack.priceCents));
  form.set(
    "line_items[0][price_data][product_data][name]",
    `${opts.pack.credits} MarketingBoss credits — ${opts.pack.name}`,
  );
  form.set("line_items[0][price_data][product_data][description]", opts.pack.blurb);
  form.set("metadata[user_id]", opts.userId);
  form.set("metadata[credits]", String(opts.pack.credits));
  form.set("metadata[pack]", opts.pack.id);

  const res = await fetch(`${API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const data = (await res.json()) as CheckoutSession & StripeError;
  if (!res.ok) throw new Error(data.error?.message || `Stripe error ${res.status}`);
  return data;
}

/** Fetch a Checkout Session by id (used to fulfill instantly on the return page). */
export async function retrieveSession(id: string): Promise<CheckoutSession> {
  const res = await fetch(`${API}/checkout/sessions/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key()}` },
  });
  const data = (await res.json()) as CheckoutSession & StripeError;
  if (!res.ok) throw new Error(data.error?.message || `Stripe error ${res.status}`);
  return data;
}

/**
 * Verify a webhook payload against the Stripe-Signature header and return the
 * parsed event. Throws on any mismatch. Implements Stripe's scheme:
 * HMAC-SHA256 over `${t}.${payload}` keyed by the webhook secret, compared
 * timing-safely, with a 5-minute timestamp tolerance to block replays.
 */
export function constructWebhookEvent(
  payload: string,
  header: string | null,
  secret: string,
): { type: string; data: { object: CheckoutSession } } {
  if (!header) throw new Error("Missing Stripe-Signature header.");
  const parts = new Map(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i), kv.slice(i + 1)] as [string, string];
    }),
  );
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (!t || !v1) throw new Error("Malformed Stripe-Signature header.");

  const expected = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Webhook signature mismatch.");
  }

  const age = Math.floor(Date.now() / 1000) - Number(t);
  if (!Number.isFinite(age) || Math.abs(age) > 60 * 5) {
    throw new Error("Webhook timestamp outside tolerance.");
  }

  return JSON.parse(payload) as { type: string; data: { object: CheckoutSession } };
}
