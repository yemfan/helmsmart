import "server-only";

import { getAiTierLimitForUser } from "@/lib/entitlements/aiTierLimit";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Generic per-(user, feature) daily quota for paid AI generations, sharing
 * the same tiering as the CMA / House Search (free 1/day, Pro 10/day, higher
 * unlimited; see aiDailyLimitForPlan) and the same `ai_feature_usage_daily`
 * table. Each feature counts independently.
 */

export type FeatureQuota = {
  used: number;
  limit: number | null; // null = unlimited
  remaining: number | null;
  reached: boolean;
  warning: boolean;
  unlimited: boolean;
  resetDate: string;
};

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getFeatureQuota(userId: string, feature: string): Promise<FeatureQuota> {
  const today = todayDate();
  let used = 0;
  try {
    const { data } = await supabaseAdmin
      .from("ai_feature_usage_daily")
      .select("used, last_reset_date")
      .eq("user_id", userId)
      .eq("feature", feature)
      .maybeSingle();
    if (data) {
      const row = data as { used: number | null; last_reset_date: string | null };
      used = String(row.last_reset_date ?? "") === today ? Number(row.used ?? 0) : 0;
    }
  } catch (e) {
    console.warn(`[featureQuota:${feature}] read failed:`, e);
  }

  const { limit } = await getAiTierLimitForUser(userId);
  if (limit == null) {
    return { used, limit: null, remaining: null, reached: false, warning: false, unlimited: true, resetDate: today };
  }
  const remaining = Math.max(0, limit - used);
  return { used, limit, remaining, reached: used >= limit, warning: remaining <= 1, unlimited: false, resetDate: today };
}

/** Increment after a successful generation. Best-effort. */
export async function incrementFeatureUsage(userId: string, feature: string): Promise<void> {
  const today = todayDate();
  try {
    const { data } = await supabaseAdmin
      .from("ai_feature_usage_daily")
      .select("used, last_reset_date")
      .eq("user_id", userId)
      .eq("feature", feature)
      .maybeSingle();
    const row = (data ?? null) as { used: number | null; last_reset_date: string | null } | null;
    const sameDay = row && String(row.last_reset_date ?? "") === today;
    const next = sameDay ? Number(row?.used ?? 0) + 1 : 1;
    await supabaseAdmin.from("ai_feature_usage_daily").upsert(
      { user_id: userId, feature, used: next, last_reset_date: today, updated_at: new Date().toISOString() } as never,
      { onConflict: "user_id,feature" },
    );
  } catch (e) {
    console.warn(`[featureQuota:${feature}] increment failed:`, e);
  }
}
