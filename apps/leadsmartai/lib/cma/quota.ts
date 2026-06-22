import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Daily-quota peek for the agent's CMA usage.
 *
 * The propertytoolsai `/api/smart-cma` endpoint enforces this quota at
 * generation time (10/day for role='agent', tracked in `cma_daily_usage`
 * keyed on `subject_key='user:${userId}'`). The CRM-side just reads the
 * SAME row to surface a "X of Y left today" hint in the new-CMA form,
 * so agents don't get rejected at submit.
 *
 * Both apps share the same Supabase, so we read directly rather than
 * calling /api/cma/check-limit cross-app — that endpoint requires
 * forwarding auth cookies, which is messy from a server-to-server
 * fetch. Direct DB read is simpler and identical.
 */

const AGENT_DAILY_LIMIT = 10;

export type CmaQuota = {
  used: number;
  limit: number;
  remaining: number;
  reached: boolean;
  /** True when remaining ≤ 1 (one or zero left) — UI uses this to
   *  switch from neutral hint to amber warning copy. */
  warning: boolean;
  /** YYYY-MM-DD — when the counter rolls over. */
  resetDate: string;
};

/**
 * Increment the agent's daily CMA counter. The legacy flow relied on
 * propertytoolsai's /api/smart-cma to enforce + increment this; now that the
 * CRM generates CMAs itself (Claude + web search), it owns the increment too.
 * Best-effort — a counter write must never fail a successful generation.
 */
export async function incrementCmaUsage(userId: string): Promise<void> {
  const today = todayDate();
  try {
    const { data } = await supabaseAdmin
      .from("cma_daily_usage")
      .select("cma_usage_count, last_reset_date")
      .eq("subject_key", `user:${userId}`)
      .maybeSingle();
    const row = (data ?? null) as { cma_usage_count: number | null; last_reset_date: string | null } | null;
    const sameDay = row && String(row.last_reset_date ?? "") === today;
    const next = sameDay ? Number(row?.cma_usage_count ?? 0) + 1 : 1;
    await supabaseAdmin
      .from("cma_daily_usage")
      .upsert(
        { subject_key: `user:${userId}`, cma_usage_count: next, last_reset_date: today } as never,
        { onConflict: "subject_key" },
      );
  } catch (e) {
    console.warn("[cma.incrementCmaUsage] failed:", e);
  }
}

export async function getCmaQuotaForUser(userId: string): Promise<CmaQuota> {
  const today = todayDate();
  let used = 0;

  try {
    const { data } = await supabaseAdmin
      .from("cma_daily_usage")
      .select("cma_usage_count, last_reset_date")
      .eq("subject_key", `user:${userId}`)
      .maybeSingle();
    if (data) {
      const row = data as { cma_usage_count: number | null; last_reset_date: string | null };
      const resetDate = String(row.last_reset_date ?? "");
      // Counter rolls over at midnight UTC — if last_reset_date isn't
      // today, the agent's used count for "today" is effectively zero
      // even if the DB row hasn't been touched yet.
      used = resetDate === today ? Number(row.cma_usage_count ?? 0) : 0;
    }
  } catch (e) {
    console.warn("[cma.quota] read failed:", e);
    used = 0;
  }

  const limit = AGENT_DAILY_LIMIT;
  const remaining = Math.max(0, limit - used);
  return {
    used,
    limit,
    remaining,
    reached: used >= limit,
    warning: remaining <= 1,
    resetDate: today,
  };
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}
