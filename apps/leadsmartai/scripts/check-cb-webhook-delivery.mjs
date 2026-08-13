/**
 * Check whether the CloseBoss checkout completed and whether Stripe's webhook
 * delivery to closebossai.com succeeded (pending_webhooks > 0 = still failing).
 *   node apps/leadsmartai/scripts/check-cb-webhook-delivery.mjs
 */
import Stripe from "stripe";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
const key = src.match(/^STRIPE_SECRET_KEY\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
const stripe = new Stripe(key);
const iso = (s) => new Date(s * 1000).toISOString().replace("T", " ").slice(0, 19);

const paid = (await stripe.checkout.sessions.list({ limit: 10 })).data.filter((s) => s.payment_status === "paid");
console.log(`PAID checkout sessions (${paid.length}):`);
for (const s of paid) {
  console.log(`  ${iso(s.created)}  $${((s.amount_total ?? 0) / 100).toFixed(2)}  mode=${s.mode}  kind=${s.metadata?.kind ?? "-"}`);
  console.log(`     session=${s.id}`);
  console.log(`     user_id=${s.metadata?.user_id ?? "(none)"}  credits=${s.metadata?.credits ?? "(none)"}`);
}

const evs = (await stripe.events.list({ limit: 20 })).data.filter((e) =>
  ["checkout.session.completed", "invoice.paid"].includes(e.type),
);
console.log(`\nGrant-triggering events (${evs.length}):`);
for (const e of evs) {
  console.log(`  ${iso(e.created)}  ${e.type}  pending_webhooks=${e.pending_webhooks}  id=${e.id}`);
}
console.log("\npending_webhooks = 0 → all endpoints accepted it (200).");
console.log("pending_webhooks > 0 → still failing/retrying (e.g. bad STRIPE_WEBHOOK_SECRET).");
