/**
 * Read-only check of the App Store Review demo account state.
 *
 * Apple rejected build 1.0.0 (1) on April 2, 2026 under Guideline 2.1 because
 * the reviewer couldn't sign in with the credentials Michael provided
 * (`demo@leadsmart.ai` / `Demo123!`). This script answers, without modifying
 * anything:
 *
 *   - Does that email exist in auth.users? (Also checks `demo@realtybossai.com`
 *     in case the domain was a typo.)
 *   - Is the email confirmed? Unconfirmed → reviewer would hit "verify your
 *     email" before sign-in succeeds.
 *   - When was it last signed into? Never → strong signal the account was
 *     created but never finished onboarding.
 *   - Does the account have MFA enrolled? MFA → reviewer can't pass.
 *   - Is there an `agents` row linked? No agent row → mobile API returns
 *     NO_AGENT_ROW even after sign-in.
 *   - Does the agent have any leads? No leads → reviewer sees an empty app.
 *
 * Usage (from apps/leadsmartai):
 *   node ./scripts/check-app-review-demo-account.mjs
 *
 * Reads SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL)
 * from process.env — set them via `dotenv` or by sourcing `.env.local`.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Lightweight .env.local loader so the script works without `dotenv`. */
function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

loadDotEnv(join(__dirname, "..", ".env.local"));

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
  console.error("Looked in: " + join(__dirname, "..", ".env.local"));
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const CANDIDATE_EMAILS = ["demo@leadsmart.ai", "demo@realtybossai.com"];

async function lookupAuthUser(email) {
  const target = email.toLowerCase();
  let page = 1;
  let scanned = 0;
  // Cap at 100 pages × 200 = 20k users; abort if not found.
  for (; page <= 100; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users ?? [];
    scanned += users.length;
    const hit = users.find((u) => u.email?.toLowerCase() === target);
    if (hit) {
      console.error(`  (scanned ${scanned} users to find ${email})`);
      return hit;
    }
    if (users.length < 200) {
      console.error(`  (scanned ${scanned} users; no match for ${email})`);
      return null;
    }
  }
  console.error(`  (hit pagination cap at ${scanned} users; no match for ${email})`);
  return null;
}

async function reportEmail(email) {
  console.log(`\n=== ${email} ===`);
  const user = await lookupAuthUser(email);
  if (!user) {
    console.log("  auth.users: NOT FOUND");
    return null;
  }

  console.log(`  auth.users.id:          ${user.id}`);
  console.log(`  email_confirmed_at:     ${user.email_confirmed_at ?? "(unconfirmed)"}`);
  console.log(`  last_sign_in_at:        ${user.last_sign_in_at ?? "(never)"}`);
  console.log(`  created_at:             ${user.created_at}`);
  console.log(`  app_metadata.provider:  ${user.app_metadata?.provider ?? "(none)"}`);
  console.log(`  banned_until:           ${user.banned_until ?? "(not banned)"}`);

  // MFA factors
  try {
    const { data: factors } = await supabase.auth.admin.mfa.listFactors({ userId: user.id });
    const verified = (factors?.factors ?? []).filter((f) => f.status === "verified");
    console.log(`  mfa_verified_factors:   ${verified.length}`);
  } catch {
    console.log("  mfa_verified_factors:   (could not list)");
  }

  // Agent row — select * so we adapt to whatever columns the prod schema has.
  const { data: agentRow, error: agentErr } = await supabase
    .from("agents")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (agentErr) {
    console.log(`  agents row:             ERROR ${agentErr.message}`);
    return user;
  }
  if (!agentRow) {
    console.log("  agents row:             MISSING — mobile API will return NO_AGENT_ROW after sign-in");
    return user;
  }

  console.log(`  agents.id:              ${agentRow.id}`);
  const pii = ["full_name", "name", "first_name", "last_name", "phone", "email", "brokerage", "company", "deleted_at"];
  for (const col of pii) {
    if (col in agentRow) {
      const v = agentRow[col];
      console.log(`  agents.${col.padEnd(15)} ${v === null || v === undefined ? "(empty)" : v}`);
    }
  }

  // Leads count
  const { count: leadCount } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentRow.id);
  console.log(`  leads owned:            ${leadCount ?? 0}`);

  // Conversation messages (the inbox screen reads these — if 0 the reviewer
  // sees an empty Inbox tab and may flag the app as incomplete)
  const { count: smsCount } = await supabase
    .from("sms_messages")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentRow.id);
  console.log(`  sms_messages owned:     ${smsCount ?? 0}`);

  // Tasks
  const { count: taskCount } = await supabase
    .from("lead_tasks")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentRow.id);
  console.log(`  lead_tasks owned:       ${taskCount ?? 0}`);

  return user;
}

async function listAllUsers() {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  console.log("\n=== All users in auth.users ===");
  for (const u of data?.users ?? []) {
    const conf = u.email_confirmed_at ? "✓" : "✗";
    const mfa = (u.factors ?? []).filter((f) => f.status === "verified").length;
    console.log(`  ${conf} ${(u.email ?? "(no email)").padEnd(40)} mfa=${mfa} last=${u.last_sign_in_at ?? "(never)"}`);
  }
}

async function describeAgentsTable() {
  console.log("\n=== agents columns (from first row) ===");
  const { data, error } = await supabase.from("agents").select("*").limit(1);
  if (error) {
    console.log(`  ERROR: ${error.message}`);
    return;
  }
  if (!data || !data.length) {
    console.log("  agents table is empty — cannot infer columns this way.");
    return;
  }
  const row = data[0];
  for (const [col, val] of Object.entries(row)) {
    const t = val === null ? "null" : typeof val;
    const sample = val === null ? "(null)" : (typeof val === "object" ? JSON.stringify(val).slice(0, 40) : String(val).slice(0, 40));
    console.log(`  ${col.padEnd(30)} ${t.padEnd(10)} ${sample}`);
  }
}

async function main() {
  console.log(`Supabase URL: ${url}`);
  await listAllUsers();
  await describeAgentsTable();
  for (const email of CANDIDATE_EMAILS) {
    await reportEmail(email);
  }
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
