/**
 * Create / update the CloseBoss usage-pricing Stripe Prices.
 * Reads STRIPE_SECRET_KEY from apps/leadsmartai/.env.local (never printed).
 * Idempotent via lookup_key: reuses a price whose amount already matches;
 * when the amount changed, creates a new price, transfers the lookup_key to it,
 * and archives the old one. Prints the STRIPE_PRICE_ID_CB_* lines for Vercel.
 *
 *   node apps/leadsmartai/scripts/create-cb-stripe-prices.mjs
 */
import Stripe from "stripe";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, "..", ".env.local");

function readEnv(name) {
  const src = readFileSync(ENV_PATH, "utf8");
  const m = src.match(new RegExp(`^${name}\\s*=\\s*(.+)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
}

const key = readEnv("STRIPE_SECRET_KEY");
if (!key) {
  console.error(`No STRIPE_SECRET_KEY found in ${ENV_PATH}`);
  process.exit(1);
}
const mode = key.startsWith("sk_live_") ? "LIVE" : key.startsWith("sk_test_") ? "TEST" : "UNKNOWN";
console.log(`Stripe mode: ${mode}\n`);

const stripe = new Stripe(key);

const ITEMS = [
  { envVar: "STRIPE_PRICE_ID_CB_STARTER", lookup: "cb_starter", name: "CloseBoss Starter (1,000 credits/mo)", amount: 4900, recurring: true },
  { envVar: "STRIPE_PRICE_ID_CB_GROWTH", lookup: "cb_growth", name: "CloseBoss Growth (3,000 credits/mo)", amount: 9900, recurring: true },
  { envVar: "STRIPE_PRICE_ID_CB_SCALE", lookup: "cb_scale", name: "CloseBoss Scale (8,000 credits/mo)", amount: 19900, recurring: true },
  { envVar: "STRIPE_PRICE_ID_CB_PACK_1K", lookup: "cb_pack_1k", name: "CloseBoss 1,000 Credits", amount: 4900, recurring: false },
  { envVar: "STRIPE_PRICE_ID_CB_PACK_3K", lookup: "cb_pack_3k", name: "CloseBoss 3,000 Credits", amount: 12900, recurring: false },
  { envVar: "STRIPE_PRICE_ID_CB_PACK_8K", lookup: "cb_pack_8k", name: "CloseBoss 8,000 Credits", amount: 29900, recurring: false },
];

function typeMatches(price, recurring) {
  return recurring ? price.recurring?.interval === "month" : !price.recurring;
}

const out = [];
for (const it of ITEMS) {
  const existing = (await stripe.prices.list({ lookup_keys: [it.lookup], active: true, limit: 1 })).data[0];

  if (existing && existing.unit_amount === it.amount && typeMatches(existing, it.recurring)) {
    console.log(`reuse   ${it.lookup.padEnd(12)} $${(it.amount / 100).toFixed(2)}  ${existing.id}`);
    out.push(`${it.envVar}=${existing.id}`);
    continue;
  }

  // New price (reuse the product if one already exists), transferring the
  // lookup_key off the old price, then archive the old price.
  const product = existing ? existing.product : (await stripe.products.create({ name: it.name })).id;
  const price = await stripe.prices.create({
    product,
    currency: "usd",
    unit_amount: it.amount,
    lookup_key: it.lookup,
    ...(existing ? { transfer_lookup_key: true } : {}),
    ...(it.recurring ? { recurring: { interval: "month" } } : {}),
  });
  if (existing) await stripe.prices.update(existing.id, { active: false });
  console.log(`${existing ? "replace" : "create "} ${it.lookup.padEnd(12)} $${(it.amount / 100).toFixed(2)}  ${price.id}`);
  out.push(`${it.envVar}=${price.id}`);
}

console.log(`\n===== ${mode} — set these in the leadsmartai Vercel project =====`);
console.log(out.join("\n"));
