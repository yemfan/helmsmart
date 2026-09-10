/**
 * Verifies 20260327_leadsmart_ai_layer.sql (ai_cache, ai_usage).
 *
 * Usage (from repo root):
 *   npm run smoke:leadsmart-ai-layer -w propertytoolsai
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

  console.log("Checking CloseBoss layer migration (20260327_leadsmart_ai_layer)...\n");

  const { error: cacheErr } = await supabase
    .from("ai_cache")
    .select("id,prompt_hash,response,created_at")
    .limit(1);
  if (cacheErr) {
    console.error(`✗ ai_cache: ${cacheErr.message}`);
    process.exitCode = 1;
    return;
  }
  console.log("✓ ai_cache");

  const { error: usageErr } = await supabase
    .from("ai_usage")
    .select("id,user_id,tool,tokens_used,created_at")
    .limit(1);
  if (usageErr) {
    console.error(`✗ ai_usage: ${usageErr.message}`);
    process.exitCode = 1;
    return;
  }
  console.log("✓ ai_usage");

  console.log("\nCloseBoss layer migration is present and queryable.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
