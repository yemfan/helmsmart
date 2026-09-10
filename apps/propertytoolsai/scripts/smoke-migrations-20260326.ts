/**
 * Verifies 20260326_* migrations (CloseBoss backend, city market, pricing, scoring, SMS auto-follow).
 *
 * Usage (from repo root):
 *   npm run smoke:migrations-20260326 -w propertytoolsai
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

const TABLES: { table: string; select: string }[] = [
  { table: "leadsmart_runs", select: "id,lead_id,status,created_at" },
  { table: "city_market_data", select: "id,city,state,median_price,trend" },
  { table: "lead_pricing_weights", select: "id,model_version,base_price" },
  { table: "lead_pricing_predictions", select: "id,lead_id,price_credits,created_at" },
  { table: "lead_events", select: "id,lead_id,event_type,created_at" },
  { table: "lead_scores", select: "id,lead_id,score,intent,updated_at" },
  { table: "sms_messages", select: "id,lead_id,direction,created_at" },
];

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

  console.log("Checking 20260326_* migrations (CloseBoss backend + AI bundle tables)...\n");

  for (const { table, select } of TABLES) {
    const { error } = await supabase.from(table).select(select).limit(1);
    if (error) {
      console.error(`✗ ${table}: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    console.log(`✓ ${table}`);
  }

  const { error: leadsErr } = await supabase
    .from("leads")
    .select(
      [
        "id",
        "city",
        "zip_code",
        "estimated_home_value",
        "sms_ai_enabled",
        "sms_agent_takeover",
        "sms_followup_stage",
        "sms_last_outbound_at",
        "sms_last_inbound_at",
        "sms_opted_out_at",
      ].join(",")
    )
    .limit(1);

  if (leadsErr) {
    console.error(`✗ leads (20260326 columns): ${leadsErr.message}`);
    process.exitCode = 1;
    return;
  }
  console.log("✓ leads: scoring + SMS auto-follow columns");

  console.log("\nAll 20260326 migration checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
