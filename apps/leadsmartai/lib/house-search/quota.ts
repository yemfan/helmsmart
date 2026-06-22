import "server-only";

import { getAiTierLimitForUser } from "@/lib/entitlements/aiTierLimit";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Daily quota for AI House Search — same tiering as the CMA (free 1/day,
 * Pro 10/day, higher tiers unlimited; see `aiDailyLimitForPlan`). Usage
 * is counted per (user, feature) in `ai_feature_usage_daily`, resetting
 * at midnight UTC. House Search and CMA count separately.
 */

const FEATURE = "house_search";

export type HouseSearchQuota = {
  used: number;
  /** null = unlimited. */
  limit: number | null;
  /** null = unlimited. */
  remaining: number | null;
  reached: boolean;
  warning: boolean;
  unlimited: boolean;
  resetDate: string;
};

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function readUsed(userId: string): Promise<number> {
  const today = todayDate();
  try {
    const { data } = await supabaseAdmin
      .from("ai_feature_usage_daily")
      .select("used, last_reset_date")
      .eq("user_id", userId)
      .eq("feature", FEATURE)
      .maybeSingle();
    if (!data) return 0;
    const row = data as { used: number | null; last_reset_date: string | null };
    return String(row.last_reset_date ?? "") === today ? Number(row.used ?? 0) : 0;
  } catch (e) {
    console.warn("[houseSearch.quota] read failed:", e);
    return 0;
  }
}

export async function getHouseSearchQuota(userId: string): Promise<HouseSearchQuota> {
  const today = todayDate();
  const used = await readUsed(userId);
  const { limit } = await getAiTierLimitForUser(userId);

  if (limit == null) {
    return { used, limit: null, remaining: null, reached: false, warning: false, unlimited: true, resetDate: today };
  }
  const remaining = Math.max(0, limit - used);
  return {
    used,
    limit,
    remaining,
    reached: used >= limit,
    warning: remaining <= 1,
    unlimited: false,
    resetDate: today,
  };
}

/**
 * Increment the House Search counter after a successful run. Best-effort —
 * a counter write must never fail an otherwise-successful search.
 */
export async function incrementHouseSearchUsage(userId: string): Promise<void> {
  const today = todayDate();
  try {
    const { data } = await supabaseAdmin
      .from("ai_feature_usage_daily")
      .select("used, last_reset_date")
      .eq("user_id", userId)
      .eq("feature", FEATURE)
      .maybeSingle();
    const row = (data ?? null) as { used: number | null; last_reset_date: string | null } | null;
    const sameDay = row && String(row.last_reset_date ?? "") === today;
    const next = sameDay ? Number(row?.used ?? 0) + 1 : 1;
    await supabaseAdmin.from("ai_feature_usage_daily").upsert(
      { user_id: userId, feature: FEATURE, used: next, last_reset_date: today, updated_at: new Date().toISOString() } as never,
      { onConflict: "user_id,feature" },
    );
  } catch (e) {
    console.warn("[houseSearch.incrementUsage] failed:", e);
  }
}
