/**
 * Verify the App Store Review demo account can actually sign in.
 *
 * Uses the anon key (the same one the mobile app ships with) so this mirrors
 * what an iPad reviewer will experience — admin paths are bypassed.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  console.error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in env.");
  process.exit(1);
}

const supabase = createClient(url, anonKey, { auth: { persistSession: false } });

const API_BASE = process.env.LEADSMART_API_URL || "https://www.closebossai.com";

async function callMobileApi(path, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

async function main() {
  console.log(`Supabase URL: ${url}`);
  console.log(`API base:     ${API_BASE}`);
  const email = "demo@leadsmart.ai";
  const password = "Demo123!";
  console.log(`Trying sign-in: ${email} / ${password}\n`);

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error(`✗ Sign-in FAILED: ${error.message} (status ${error.status})`);
    process.exit(1);
  }
  console.log(`✓ Sign-in OK`);
  console.log(`  access_token expires_in: ${data.session?.expires_in}s`);
  console.log(`  user.id:                 ${data.user?.id}`);
  console.log(`  user.email:              ${data.user?.email}`);
  console.log(`  user.email_confirmed_at: ${data.user?.email_confirmed_at}`);

  // Hit the mobile API endpoints a reviewer's first session will exercise.
  // We want to fail loudly here, before App Store review, if the demo
  // agent's data is somehow unreachable through the production API.
  const token = data.session?.access_token;
  if (!token) {
    console.error("✗ No access token in session — cannot exercise mobile API");
    process.exit(1);
  }

  console.log(`\n--- mobile API checks ---`);

  const leads = await callMobileApi("/api/mobile/leads", token);
  const leadCount = Array.isArray(leads.body?.leads) ? leads.body.leads.length : 0;
  console.log(`GET /api/mobile/leads      → ${leads.status} (${leadCount} lead(s))`);
  if (leads.status !== 200) {
    console.error("  ✗ Leads tab will be broken or empty.");
    process.exitCode = 1;
  } else if (leadCount === 0) {
    console.error("  ⚠ Leads tab will be empty. Run seed-app-review-demo-account.mjs.");
    process.exitCode = 1;
  } else {
    console.log(`  ✓ first lead: ${leads.body.leads[0]?.name ?? "(no name)"}`);
  }

  const inbox = await callMobileApi("/api/mobile/inbox", token);
  const threadCount = Array.isArray(inbox.body?.threads) ? inbox.body.threads.length : 0;
  console.log(`GET /api/mobile/inbox      → ${inbox.status} (${threadCount} thread(s))`);
  if (inbox.status !== 200) {
    console.error("  ✗ Inbox tab will be broken.");
    process.exitCode = 1;
  } else if (threadCount === 0) {
    console.error("  ⚠ Inbox tab will be empty. Run seed-app-review-demo-messages.mjs.");
    process.exitCode = 1;
  } else {
    const t = inbox.body.threads[0];
    console.log(`  ✓ top thread: ${t.leadName ?? "(no name)"} — "${t.preview?.slice(0, 60)}…"`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
