/**
 * Guards for the AI Home Value Estimator (Claude + web_search is ~15-40s and
 * costs real money per call, on a public/guest page):
 *   - durable per-address cache (ai_home_value_cache) so repeat lookups of the
 *     same address are instant + free for N days
 *   - per-IP daily counter (ai_home_value_ip_usage) to bound guest abuse
 *
 * All writes go through the service-role server client; tables are RLS-on with
 * no policies (see 20260627000000_ai_home_value_cache_ratelimit.sql).
 */
import { supabaseServer } from "@/lib/supabaseServer";
import type { HomeValueEstimateResponse } from "@/lib/homeValue/types";

/** Default cache freshness window — comps move slowly; 14 days is plenty. */
export const AI_HV_CACHE_DAYS = 14;
/** Guest (unauthenticated) estimates allowed per IP per day. */
export const AI_HV_GUEST_IP_DAILY_LIMIT = 3;

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const first = fwd.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Canonical cache key for an address — lowercase, collapse whitespace, strip
 *  edge punctuation so trivial formatting differences hit the same row. */
export function addressKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s,]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

/** Return a cached response for this address if one exists within the window. */
export async function getCachedAiEstimate(
  key: string,
  maxAgeDays = AI_HV_CACHE_DAYS,
): Promise<HomeValueEstimateResponse | null> {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseServer
    .from("ai_home_value_cache")
    .select("response_json")
    .eq("address_key", key)
    .gte("created_at", cutoff)
    .maybeSingle();
  if (error) {
    console.warn("[aiCache] read failed:", error.message);
    return null;
  }
  const row = data as { response_json?: HomeValueEstimateResponse } | null;
  return row?.response_json ?? null;
}

/** Upsert the cached response for an address (overwrites any older row). */
export async function setCachedAiEstimate(
  key: string,
  response: HomeValueEstimateResponse,
): Promise<void> {
  const { error } = await supabaseServer
    .from("ai_home_value_cache")
    .upsert(
      { address_key: key, response_json: response, created_at: new Date().toISOString() },
      { onConflict: "address_key" },
    );
  if (error) console.warn("[aiCache] write failed:", error.message);
}

/**
 * Check + bump the per-IP daily counter. Read-then-write (a small race is fine
 * for a soft cap). Returns whether the request is allowed and the post-bump
 * count. Fails open — a counter error never blocks a legitimate estimate.
 */
export async function checkAndBumpIpUsage(
  ip: string,
  limit = AI_HV_GUEST_IP_DAILY_LIMIT,
): Promise<{ allowed: boolean; used: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseServer
    .from("ai_home_value_ip_usage")
    .select("count")
    .eq("ip", ip)
    .eq("usage_date", today)
    .maybeSingle();
  if (error) {
    console.warn("[aiCache] ip-usage read failed (fail open):", error.message);
    return { allowed: true, used: 0 };
  }
  const current = (data as { count?: number } | null)?.count ?? 0;
  if (current >= limit) return { allowed: false, used: current };

  const next = current + 1;
  const { error: upErr } = await supabaseServer
    .from("ai_home_value_ip_usage")
    .upsert(
      { ip, usage_date: today, count: next, updated_at: new Date().toISOString() },
      { onConflict: "ip,usage_date" },
    );
  if (upErr) console.warn("[aiCache] ip-usage bump failed:", upErr.message);
  return { allowed: true, used: next };
}
