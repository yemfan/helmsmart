/**
 * End-to-end test of the SUBSCRIPTION credit-grant path (test mode).
 * Creates a test customer + subscription on the Growth price with the same
 * metadata our checkout route sets, which makes Stripe fire invoice.paid ->
 * our webhook -> grantMonthlyCreditsForInvoice -> +3000 credits.
 *
 * Cleans up the subscription afterwards. Verify the DB separately.
 *   node apps/leadsmartai/scripts/test-cb-subscription.mjs
 */
import Stripe from "stripe";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
const key = src.match(/^STRIPE_SECRET_KEY\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
if (!key.startsWith("sk_test_")) {
  console.error("Refusing to run: this is not a TEST key.");
  process.exit(1);
}
const stripe = new Stripe(key);

const USER_ID = "8fe958b2-675c-4d42-911c-44a3a43c5be2"; // fan.yes@gmail.com
const PLAN = "growth";
const CREDITS = 3000;

const price = (await stripe.prices.list({ lookup_keys: ["cb_growth"], active: true, limit: 1 })).data[0];
console.log(`Using price ${price.id} ($${(price.unit_amount / 100).toFixed(2)}/${price.recurring.interval})`);

const customer = await stripe.customers.create({
  email: "fan.yes@gmail.com",
  description: "CloseBoss subscription grant test",
  payment_method: "pm_card_visa",
  invoice_settings: { default_payment_method: "pm_card_visa" },
});
console.log(`Customer ${customer.id}`);

// Same metadata shape the checkout route writes onto subscription_data.
const sub = await stripe.subscriptions.create({
  customer: customer.id,
  items: [{ price: price.id }],
  metadata: { user_id: USER_ID, plan: PLAN, credits: String(CREDITS) },
  expand: ["latest_invoice"],
});
console.log(`Subscription ${sub.id} status=${sub.status}`);
const inv = sub.latest_invoice;
console.log(`Invoice ${inv?.id} status=${inv?.status} paid=${inv?.paid ?? "?"}`);

// Give Stripe a moment to deliver invoice.paid to the webhook.
console.log("\nWaiting 12s for webhook delivery…");
await new Promise((r) => setTimeout(r, 12000));

const events = (await stripe.events.list({ limit: 15 })).data.filter((e) => e.type === "invoice.paid");
for (const e of events.slice(0, 3)) {
  console.log(`  invoice.paid ${e.id} pending_webhooks=${e.pending_webhooks}`);
}

// Clean up: cancel the subscription so it doesn't renew in test mode.
await stripe.subscriptions.cancel(sub.id);
console.log(`\nCanceled ${sub.id} (cleanup).`);
console.log("Now check the DB for a 'monthly_grant' ledger row of +3000.");
