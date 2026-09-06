/**
 * Create the one-time Stripe Price for the Signature setup fee.
 *
 * Reads STRIPE_SECRET_KEY from apps/leadsmartai/.env.local (never printed), so
 * whichever key is there decides the mode — run it once with the test key and
 * once with the live key. Idempotent via lookup_key `cb_signature_setup`:
 * reuses a matching active price, replaces it (and archives the old one) if
 * the amount changed. Prints the env line for the leadsmartai Vercel project.
 *
 *   node apps/leadsmartai/scripts/create-cb-setup-fee-price.mjs
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

// Must match CREDIT_TIERS[signature].setupFeeUsd in lib/credits/pricing.ts.
const ITEM = {
  envVar: "STRIPE_PRICE_ID_CB_SIGNATURE_SETUP",
  lookup: "cb_signature_setup",
  name: "CloseBoss Signature setup (one-time, with a specialist)",
  amount: 49900,
};

const existing = (await stripe.prices.list({ lookup_keys: [ITEM.lookup], active: true, limit: 1 })).data[0];
let priceId;
if (existing && existing.unit_amount === ITEM.amount && !existing.recurring) {
  console.log(`reuse   ${ITEM.lookup}  $${(ITEM.amount / 100).toFixed(2)}  ${existing.id}`);
  priceId = existing.id;
} else {
  const product = existing ? existing.product : (await stripe.products.create({ name: ITEM.name })).id;
  const price = await stripe.prices.create({
    product,
    currency: "usd",
    unit_amount: ITEM.amount,
    lookup_key: ITEM.lookup,
    ...(existing ? { transfer_lookup_key: true } : {}),
  });
  if (existing) await stripe.prices.update(existing.id, { active: false });
  console.log(`${existing ? "replace" : "create "} ${ITEM.lookup}  $${(ITEM.amount / 100).toFixed(2)}  ${price.id}`);
  priceId = price.id;
}

console.log(`\n===== ${mode} — set this in the leadsmartai Vercel project (and .env.local) =====`);
console.log(`${ITEM.envVar}=${priceId}`);
