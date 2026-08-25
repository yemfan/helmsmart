import Stripe from "stripe";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
const key = src.match(/^STRIPE_SECRET_KEY\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
const stripe = new Stripe(key);
const iso = (s) => new Date(s * 1000).toISOString().replace("T", " ").slice(0, 19);

const sessions = await stripe.checkout.sessions.list({ limit: 8 });
console.log(`Recent checkout sessions (${sessions.data.length}):`);
for (const s of sessions.data) {
  console.log(
    `  ${iso(s.created)}  mode=${s.mode}  status=${s.status}  pay=${s.payment_status}  total=$${((s.amount_total ?? 0) / 100).toFixed(2)}  kind=${s.metadata?.kind ?? "-"}  user=${s.metadata?.user_id ?? "-"}`,
  );
}

const events = await stripe.events.list({ limit: 12 });
console.log(`\nRecent events (${events.data.length}):`);
for (const e of events.data) console.log(`  ${iso(e.created)}  ${e.type}`);

// Webhook endpoints configured in this (test) account
const hooks = await stripe.webhookEndpoints.list({ limit: 10 });
console.log(`\nWebhook endpoints (${hooks.data.length}):`);
for (const h of hooks.data) console.log(`  ${h.status}  ${h.url}\n    events: ${h.enabled_events.slice(0, 6).join(", ")}${h.enabled_events.length > 6 ? " …" : ""}`);
