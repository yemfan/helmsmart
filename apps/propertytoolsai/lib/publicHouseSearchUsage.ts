import "server-only";

import { createHash } from "crypto";

import { getUserFromRequest } from "@/lib/authFromRequest";
import { resolveUserPlanType } from "@/lib/ai/resolveUserPlan";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * Rate limiter for the PUBLIC consumer AI house search (the /search "Homes in
 * Your Budget" surface, now AI-backed). A 3-tier conversion funnel, mirroring
 * leadsmartai's lib/house-search/publicUsage.ts. It is self-contained to this
 * public surface and does NOT touch the CMA quota in lib/cmaUsage.ts.
 *
 *   1. ANONYMOUS (no session)              → 1 free search / day / IP
 *                                            (reason: "anon_limit")
 *   2. SIGNED-IN, free plan                → 5 free searches / day / user
 *                                            (reason: "free_limit")
 *   3. SIGNED-IN with any paid plan        → no cap
 *
 * Paid detection: resolveUserPlanType() returns `agents.plan_type` /
 * `leadsmart_users.plan`, defaulting to "free". Only an explicit paid slug on
 * the PAID_PLANS allowlist (pro, premium, signature, team, and the legacy
 * growth, elite) grants unlimited access — anything else (free, starter,
 * empty, or an unknown/garbage string) falls through to the 5/day free tier.
 * (propertytoolsai has no dedicated boolean "is-paid" helper; this is the same
 * source resolveUserPlan uses for rate limiting elsewhere.)
 *
 * Storage: anonymous counts reuse the per-IP `cma_daily_usage` counter
 * (namespaced "hs:anon:") so they never collide with the CMA anon counter
 * ("anon:"). Signed-in free counts live in `ai_feature_usage_daily` under a
 * DEDICATED feature key ("public_house_search"). Both tables live in the same
 * Supabase project as leadsmartai.
 */

const ANON_DAILY_LIMIT = 1;
const PUBLIC_FREE_DAILY = 5;
const PUBLIC_FEATURE = "public_house_search";

export type PublicHouseSearchUsage = {
  /** Which tier gated this request. */
  tier: "anonymous" | "free" | "unlimited";
  /** null = unlimited. */
  limit: number | null;
  used: number;
  /** null = unlimited. */
  remaining: number | null;
  reached: boolean;
  /** Populated in the 429 payload so the client renders the right CTA. */
  reason: "anon_limit" | "free_limit" | null;
  resetDate: string;
};

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function anonSubjectKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0]?.trim() || "unknown";
  const ua = req.headers.get("user-agent") || "unknown";
  const raw = `${ip}|${ua}`;
  return `hs:anon:${createHash("sha256").update(raw).digest("hex").slice(0, 24)}`;
}

const PAID_PLANS = new Set(["pro", "premium", "signature", "team", "growth", "elite"]);
function isUnlimitedPlan(planType: string): boolean {
  return PAID_PLANS.has(planType.trim().toLowerCase());
}

function unlimitedUsage(): PublicHouseSearchUsage {
  return {
    tier: "unlimited",
    limit: null,
    used: 0,
    remaining: null,
    reached: false,
    reason: null,
    resetDate: todayDate(),
  };
}

// ── Anonymous (per-IP) counter — reuses cma_daily_usage storage ──────────

async function readAnonUsed(subjectKey: string): Promise<number> {
  const today = todayDate();
  const { data } = await supabaseServer
    .from("cma_daily_usage")
    .select("cma_usage_count,last_reset_date")
    .eq("subject_key", subjectKey)
    .maybeSingle();
  if (!data) return 0;
  const resetDate = String((data as { last_reset_date?: unknown }).last_reset_date ?? "");
  return resetDate === today
    ? Number((data as { cma_usage_count?: unknown }).cma_usage_count ?? 0)
    : 0;
}

function anonResult(used: number): PublicHouseSearchUsage {
  return {
    tier: "anonymous",
    limit: ANON_DAILY_LIMIT,
    used,
    remaining: Math.max(0, ANON_DAILY_LIMIT - used),
    reached: used >= ANON_DAILY_LIMIT,
    reason: used >= ANON_DAILY_LIMIT ? "anon_limit" : null,
    resetDate: todayDate(),
  };
}

async function incrementAnon(subjectKey: string): Promise<number> {
  const today = todayDate();
  const { data: existing } = await supabaseServer
    .from("cma_daily_usage")
    .select("subject_key,cma_usage_count,last_reset_date")
    .eq("subject_key", subjectKey)
    .maybeSingle();

  if (!existing) {
    const { data: inserted, error } = await supabaseServer
      .from("cma_daily_usage")
      .insert({
        subject_key: subjectKey,
        user_id: null,
        role: "anonymous",
        cma_usage_count: 1,
        last_reset_date: today,
      } as Record<string, unknown>)
      .select("cma_usage_count")
      .single();
    if (error) throw error;
    return Number((inserted as { cma_usage_count?: unknown } | null)?.cma_usage_count ?? 1);
  }

  const resetDate = String((existing as { last_reset_date?: unknown }).last_reset_date ?? "");
  const current = Number((existing as { cma_usage_count?: unknown }).cma_usage_count ?? 0);
  if (resetDate !== today) {
    const { data: updated, error } = await supabaseServer
      .from("cma_daily_usage")
      .update({
        cma_usage_count: 1,
        last_reset_date: today,
        updated_at: new Date().toISOString(),
      } as Record<string, unknown>)
      .eq("subject_key", subjectKey)
      .select("cma_usage_count")
      .single();
    if (error) throw error;
    return Number((updated as { cma_usage_count?: unknown } | null)?.cma_usage_count ?? 1);
  }
  if (current >= ANON_DAILY_LIMIT) return current;
  const { data: updated, error } = await supabaseServer
    .from("cma_daily_usage")
    .update({
      cma_usage_count: current + 1,
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>)
    .eq("subject_key", subjectKey)
    .select("cma_usage_count")
    .single();
  if (error) throw error;
  return Number((updated as { cma_usage_count?: unknown } | null)?.cma_usage_count ?? current + 1);
}

// ── Signed-in free tier (per-user) — ai_feature_usage_daily ──────────────

async function readFreeUsed(userId: string): Promise<number> {
  const today = todayDate();
  try {
    const { data } = await supabaseAdmin
      .from("ai_feature_usage_daily")
      .select("used, last_reset_date")
      .eq("user_id", userId)
      .eq("feature", PUBLIC_FEATURE)
      .maybeSingle();
    if (!data) return 0;
    const row = data as { used: number | null; last_reset_date: string | null };
    return String(row.last_reset_date ?? "") === today ? Number(row.used ?? 0) : 0;
  } catch (e) {
    console.warn("[publicHouseSearch] free-usage read failed:", e);
    return 0;
  }
}

function freeResult(used: number): PublicHouseSearchUsage {
  return {
    tier: "free",
    limit: PUBLIC_FREE_DAILY,
    used,
    remaining: Math.max(0, PUBLIC_FREE_DAILY - used),
    reached: used >= PUBLIC_FREE_DAILY,
    reason: used >= PUBLIC_FREE_DAILY ? "free_limit" : null,
    resetDate: todayDate(),
  };
}

async function incrementFree(userId: string): Promise<void> {
  const today = todayDate();
  try {
    const { data } = await supabaseAdmin
      .from("ai_feature_usage_daily")
      .select("used, last_reset_date")
      .eq("user_id", userId)
      .eq("feature", PUBLIC_FEATURE)
      .maybeSingle();
    const row = (data ?? null) as { used: number | null; last_reset_date: string | null } | null;
    const sameDay = row && String(row.last_reset_date ?? "") === today;
    const next = sameDay ? Number(row?.used ?? 0) + 1 : 1;
    await supabaseAdmin.from("ai_feature_usage_daily").upsert(
      {
        user_id: userId,
        feature: PUBLIC_FEATURE,
        used: next,
        last_reset_date: today,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "user_id,feature" },
    );
  } catch (e) {
    console.warn("[publicHouseSearch] free-usage increment failed:", e);
  }
}

// ── Public API ───────────────────────────────────────────────────────────

/** Read (no mutation) the current gate state for this request. */
export async function getPublicHouseSearchUsage(req: Request): Promise<PublicHouseSearchUsage> {
  const user = await getUserFromRequest(req);
  if (!user) return anonResult(await readAnonUsed(anonSubjectKey(req)));

  const plan = await resolveUserPlanType(user.id);
  if (isUnlimitedPlan(plan)) return unlimitedUsage(); // paid plan → no cap
  return freeResult(await readFreeUsed(user.id));
}

/**
 * Increment the relevant counter after a SUCCESSFUL search only. Returns the
 * post-increment usage so the client can show remaining allowance.
 */
export async function incrementPublicHouseSearchUsage(
  req: Request,
): Promise<PublicHouseSearchUsage> {
  const user = await getUserFromRequest(req);
  if (!user) return anonResult(await incrementAnon(anonSubjectKey(req)));

  const plan = await resolveUserPlanType(user.id);
  if (isUnlimitedPlan(plan)) return unlimitedUsage();
  await incrementFree(user.id);
  return freeResult(await readFreeUsed(user.id));
}
