/**
 * Create the CloseBoss Stripe webhook endpoint (test mode) pointing at the
 * deployed /api/stripe/webhook. Idempotent: if one already exists for the URL,
 * reports it instead of duplicating (the signing secret for an existing
 * endpoint is only viewable in the Stripe dashboard).
 *   node apps/leadsmartai/scripts/create-cb-webhook.mjs
 */
import Stripe from "stripe";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
const key = src.match(/^STRIPE_SECRET_KEY\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
const stripe = new Stripe(key);
const mode = key.startsWith("sk_live_") ? "LIVE" : key.startsWith("sk_test_") ? "TEST" : "UNKNOWN";

const URL = "https://www.closebossai.com/api/stripe/webhook";
const EVENTS = [
  "checkout.session.completed",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];

const existing = (await stripe.webhookEndpoints.list({ limit: 100 })).data.find((e) => e.url === URL);
if (existing) {
  console.log(`Endpoint already exists (${mode}): ${existing.id}  status=${existing.status}`);
  console.log("Signing secret isn't returned for existing endpoints — copy it from the Stripe dashboard.");
} else {
  const ep = await stripe.webhookEndpoints.create({
    url: URL,
    enabled_events: EVENTS,
    description: "CloseBoss usage-pricing credit grants",
  });
  console.log(`Created webhook (${mode}): ${ep.id}`);
  console.log(`URL: ${ep.url}`);
  console.log(`STRIPE_WEBHOOK_SECRET=${ep.secret}`);
}
