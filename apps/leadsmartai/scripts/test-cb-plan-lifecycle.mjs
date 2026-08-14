/**
 * End-to-end test of the subscription CREDIT-GRANT lifecycle against the live
 * production webhook (Stripe test mode).
 *
 *   subscribe (Growth)  -> expect +3000  (full allotment)
 *   upgrade   (Scale)   -> expect +5000  (DELTA only: 8000 - 3000)
 *   downgrade (Starter) -> expect +0     (never claw back)
 *
 * The upgrade/downgrade steps reproduce exactly what /api/stripe/checkout does
 * for an existing subscriber (price swap + always_invoice proration +
 * prev_credits metadata), so the webhook logic under test is the real one.
 *
 *   node apps/leadsmartai/scripts/test-cb-plan-lifecycle.mjs
 */
import Stripe from "stripe";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
const key = src.match(/^STRIPE_SECRET_KEY\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
if (!key?.startsWith("sk_test_")) {
  console.error("Refusing to run: not a TEST secret key.");
  process.exit(1);
}
const stripe = new Stripe(key);

const USER_ID = "8fe958b2-675c-4d42-911c-44a3a43c5be2";
const PLANS = {
  starter: { lookup: "cb_starter", credits: 1000 },
  growth: { lookup: "cb_growth", credits: 3000 },
  scale: { lookup: "cb_scale", credits: 8000 },
};

async function priceFor(lookup) {
  const p = (await stripe.prices.list({ lookup_keys: [lookup], active: true, limit: 1 })).data[0];
  if (!p) throw new Error(`No active price for ${lookup}`);
  return p;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. Subscribe ───────────────────────────────────────────────────────────
const growth = await priceFor(PLANS.growth.lookup);
const customer = await stripe.customers.create({
  email: "fan.yes@gmail.com",
  description: "CloseBoss plan-lifecycle test",
  payment_method: "pm_card_visa",
  invoice_settings: { default_payment_method: "pm_card_visa" },
});
const sub = await stripe.subscriptions.create({
  customer: customer.id,
  items: [{ price: growth.id }],
  metadata: { user_id: USER_ID, plan: "growth", credits: String(PLANS.growth.credits) },
});
console.log(`1. SUBSCRIBE  Growth  sub=${sub.id} status=${sub.status}  -> expect +3000`);
await wait(15000);

// ── 2. Upgrade (proration; grant should be the DELTA) ──────────────────────
const scale = await priceFor(PLANS.scale.lookup);
const item = sub.items.data[0];
await stripe.subscriptions.update(sub.id, {
  items: [{ id: item.id, price: scale.id }],
  proration_behavior: "always_invoice",
  payment_behavior: "allow_incomplete",
  metadata: {
    user_id: USER_ID,
    plan: "scale",
    credits: String(PLANS.scale.credits),
    prev_credits: String(PLANS.growth.credits),
  },
});
console.log(`2. UPGRADE    Scale                       -> expect +5000 (delta)`);
await wait(15000);

// ── 3. Downgrade (negative delta; must NOT grant) ──────────────────────────
const starter = await priceFor(PLANS.starter.lookup);
const cur = await stripe.subscriptions.retrieve(sub.id);
await stripe.subscriptions.update(sub.id, {
  items: [{ id: cur.items.data[0].id, price: starter.id }],
  proration_behavior: "always_invoice",
  payment_behavior: "allow_incomplete",
  metadata: {
    user_id: USER_ID,
    plan: "starter",
    credits: String(PLANS.starter.credits),
    prev_credits: String(PLANS.scale.credits),
  },
});
console.log(`3. DOWNGRADE  Starter                     -> expect +0 (no clawback)`);
await wait(15000);

// ── Report webhook delivery ────────────────────────────────────────────────
const events = (await stripe.events.list({ limit: 25 })).data.filter((e) => e.type === "invoice.paid");
console.log(`\ninvoice.paid events (newest first):`);
for (const e of events.slice(0, 5)) {
  const reason = e.data.object?.billing_reason;
  console.log(`  ${e.id}  reason=${reason}  pending_webhooks=${e.pending_webhooks}`);
}

// ── Cleanup ────────────────────────────────────────────────────────────────
await stripe.subscriptions.cancel(sub.id);
console.log(`\nCanceled ${sub.id} (cleanup).`);
console.log("Expected net credit change: +8000 (3000 + 5000 + 0).");
