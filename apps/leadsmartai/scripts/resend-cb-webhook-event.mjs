/**
 * Force-redeliver the pending checkout.session.completed event to the
 * CloseBoss webhook endpoint, then report whether it was accepted.
 *   node apps/leadsmartai/scripts/resend-cb-webhook-event.mjs
 */
import Stripe from "stripe";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
const key = src.match(/^STRIPE_SECRET_KEY\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
const stripe = new Stripe(key);

const CB_URL = "https://www.closebossai.com/api/stripe/webhook";
const endpoint = (await stripe.webhookEndpoints.list({ limit: 100 })).data.find((e) => e.url === CB_URL);
if (!endpoint) {
  console.error("No CloseBoss webhook endpoint found.");
  process.exit(1);
}

const ev = (await stripe.events.list({ limit: 20 })).data.find(
  (e) => e.type === "checkout.session.completed" && e.pending_webhooks > 0,
);
if (!ev) {
  console.log("No pending checkout.session.completed event — nothing to resend (likely already delivered).");
  process.exit(0);
}

console.log(`Resending ${ev.id} to ${endpoint.id} …`);
try {
  // Stripe API: POST /v1/events/{id}/retry with the destination endpoint.
  const res = await stripe.events.retrieve(ev.id); // sanity read
  const retried = await stripe._requestWithRetries
    ? null
    : null;
  // The SDK has no first-class retry helper on all versions — use rawRequest.
  const out = await stripe.rawRequest(
    "POST",
    `/v1/events/${ev.id}/retry`,
    { webhook_endpoint: endpoint.id },
    {},
  );
  console.log(`Resent. Event ${out.id ?? res.id} pending_webhooks now = ${out.pending_webhooks}`);
} catch (e) {
  console.error(`Resend failed: ${e.message}`);
  console.error("Fallback: resend from the Stripe Dashboard (Developers -> Webhooks -> endpoint -> event -> Resend).");
  process.exit(1);
}
