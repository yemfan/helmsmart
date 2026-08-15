/**
 * Refund credits through the ledger for a render that charged but never
 * delivered (e.g. a 504 that killed the function before the automatic refund
 * could run).
 *
 * Goes through grant_credits() so the refund is an auditable ledger row rather
 * than an edit to the balance column — the ledger stays the truth.
 *
 *   node apps/leadsmartai/scripts/refund-credits.mjs <userId> <amount> "<reason>" "<ref>"
 *
 * `ref` makes it idempotent: re-running with the same ref is a no-op, so a
 * double-run can't double-refund.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const [, , userId, amountRaw, reason = "refund", ref] = process.argv;
if (!userId || !amountRaw || !ref) {
  console.error('Usage: node refund-credits.mjs <userId> <amount> "<reason>" "<ref>"');
  process.exit(1);
}
const amount = Number(amountRaw);
if (!Number.isFinite(amount) || amount <= 0) {
  console.error("amount must be a positive number");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
const read = (k) => env.match(new RegExp(`^${k}\\s*=\\s*(.+)$`, "m"))?.[1].trim().replace(/^["']|["']$/g, "");

const url = read("NEXT_PUBLIC_SUPABASE_URL");
const key = read("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const res = await fetch(`${url}/rest/v1/rpc/grant_credits`, {
  method: "POST",
  headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ p_user: userId, p_amount: amount, p_reason: reason, p_ref: ref }),
});
const body = await res.text();
if (!res.ok) {
  console.error(`grant_credits failed (${res.status}): ${body}`);
  process.exit(1);
}
console.log(`Granted ${amount} to ${userId} (reason=${reason}, ref=${ref}).`);
console.log(`New balance: ${body}`);
