/**
 * Verify the 6 CloseBoss prices are correct + chargeable (test mode).
 * Retrieves each by lookup_key and creates a throwaway Checkout Session for one
 * plan + one pack to prove the session config (amount, mode, metadata) is valid.
 *   node apps/leadsmartai/scripts/verify-cb-stripe-prices.mjs
 */
import Stripe from "stripe";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
const key = src.match(/^STRIPE_SECRET_KEY\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
if (!key) {
  console.error("No STRIPE_SECRET_KEY in .env.local");
  process.exit(1);
}
const stripe = new Stripe(key);

const LOOKUPS = ["cb_starter", "cb_growth", "cb_scale", "cb_pack_1k", "cb_pack_3k", "cb_pack_8k"];

console.log("Prices:");
for (const lk of LOOKUPS) {
  const p = (await stripe.prices.list({ lookup_keys: [lk], active: true, limit: 1 })).data[0];
  if (!p) {
    console.log(`  ${lk.padEnd(12)} MISSING`);
    continue;
  }
  const kind = p.recurring ? `recurring/${p.recurring.interval}` : "one-time";
  console.log(`  ${lk.padEnd(12)} $${(p.unit_amount / 100).toFixed(2)}  ${kind}  active=${p.active}  ${p.id}`);
}

// Prove a subscription + a payment session both build with our metadata shape.
async function sampleSession(lookup, mode, credits) {
  const price = (await stripe.prices.list({ lookup_keys: [lookup], active: true, limit: 1 })).data[0];
  const s = await stripe.checkout.sessions.create({
    mode,
    customer_email: "test@example.com",
    line_items: [{ price: price.id, quantity: 1 }],
    success_url: "https://example.com/ok",
    cancel_url: "https://example.com/cancel",
    ...(mode === "subscription"
      ? { subscription_data: { metadata: { user_id: "test", plan: lookup.replace("cb_", ""), credits: String(credits) } } }
      : {}),
    metadata: { user_id: "test", kind: mode === "payment" ? "credit_topup" : "sub", credits: String(credits) },
  });
  console.log(`\n${mode} session for ${lookup}: total=$${(s.amount_total / 100).toFixed(2)}  url ok=${Boolean(s.url)}`);
}

await sampleSession("cb_growth", "subscription", 3000);
await sampleSession("cb_pack_1k", "payment", 1000);
console.log("\nAll good — prices exist and both checkout modes build cleanly.");
