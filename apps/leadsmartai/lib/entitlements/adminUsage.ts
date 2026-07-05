import { supabaseAdmin } from "@/lib/supabase/admin";
import { PRODUCT_LEADSMART_AGENT } from "@/lib/entitlements/product";
import type { AgentUsageDaily, ProductKey } from "@/lib/entitlements/types";

export type UsageCounterField =
  | "cma_reports_used"
  | "leads_used"
  | "contacts_used"
  | "report_downloads_used"
  | "ai_actions_used"
  | "voice_minutes_used";

/** UTC calendar date `YYYY-MM-DD` (matches `usage.ts` / DB `usage_date`). */
function utcTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Service-role: ensure a row exists for today (bypasses RLS). Use only on the server.
 * Prefer DB RPC `ensure_daily_usage_row` when using the user-scoped client.
 */
export async function ensureDailyUsageRow(
  userId: string,
  product: ProductKey | string = PRODUCT_LEADSMART_AGENT
): Promise<void> {
  const today = utcTodayDateString();

  const { error } = await supabaseAdmin.from("entitlement_usage_daily").upsert(
    {
      user_id: userId,
      product,
      usage_date: today,
    },
    {
      onConflict: "user_id,product,usage_date",
      ignoreDuplicates: true,
    }
  );

  if (error) throw error;
}

/**
 * Service-role: ensure row exists, then return today’s usage row.
 */
export async function getTodayUsage(
  userId: string,
  product: ProductKey | string = PRODUCT_LEADSMART_AGENT
): Promise<AgentUsageDaily | null> {
  const today = utcTodayDateString();

  await ensureDailyUsageRow(userId, product);

  const { data, error } = await supabaseAdmin
    .from("entitlement_usage_daily")
    .select("*")
    .eq("user_id", userId)
    .eq("product", product)
    .eq("usage_date", today)
    .maybeSingle();

  if (error) throw error;
  return data as AgentUsageDaily | null;
}

/**
 * Service-role: increment a counter for today (UTC) after ensuring the row exists.
 * `amount` defaults to 1; pass a larger value for batched units (e.g. voice
 * minutes, where one call consumes several whole minutes at once).
 */
export async function incrementUsage(
  userId: string,
  field: UsageCounterField,
  product: ProductKey | string = PRODUCT_LEADSMART_AGENT,
  amount = 1
): Promise<void> {
  if (amount <= 0) return;
  const today = utcTodayDateString();

  await ensureDailyUsageRow(userId, product);

  const { data: current, error: currentError } = await supabaseAdmin
    .from("entitlement_usage_daily")
    .select(field)
    .eq("user_id", userId)
    .eq("product", product)
    .eq("usage_date", today)
    .single();

  if (currentError) throw currentError;

  const raw = (current as Record<string, unknown> | null)?.[field];
  const prev = typeof raw === "number" ? raw : 0;
  const nextValue = prev + amount;

  const { error } = await supabaseAdmin
    .from("entitlement_usage_daily")
    .update({
      [field]: nextValue,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("product", product)
    .eq("usage_date", today);

  if (error) throw error;
}
