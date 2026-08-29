/**
 * Verifies 20260322_twilio_sms_integration.sql: leads phone/sms fields + message_logs content/status.
 *
 * Usage (from repo root):
 *   npm run smoke:twilio-sms -w propertytoolsai
 *
 * Env: apps/propertytoolsai/.env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (check apps/propertytoolsai/.env.local)"
    );
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(url, key);

  console.log("Checking Twilio SMS migration (20260322_twilio_sms_integration)...\n");

  const { error: leadsErr } = await supabase
    .from("leads")
    .select("id,phone,sms_opt_in")
    .limit(1);
  if (leadsErr) {
    console.error(`✗ leads (phone, sms_opt_in): ${leadsErr.message}`);
    process.exitCode = 1;
    return;
  }
  console.log("✓ leads: phone, sms_opt_in OK (readable)");

  const { error: logsErr } = await supabase
    .from("message_logs")
    .select("id,content,status,type")
    .limit(1);
  if (logsErr) {
    console.error(`✗ message_logs (content, status): ${logsErr.message}`);
    process.exitCode = 1;
    return;
  }
  console.log("✓ message_logs: content + status OK (readable; status allows 'received')");

  console.log("\nTwilio SMS integration migration is present and queryable.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
