import "server-only";

import { createHash } from "node:crypto";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * A daily quota per browser for the hub's public endpoints.
 *
 * Same mechanism as the public house search (`lib/house-search/publicUsage`):
 * one `cma_daily_usage` row per hashed (ip | user-agent) per namespace,
 * reset daily. The limits are generous — a real visitor never meets them —
 * and exist to bound what a script can do to one agent's CRM and one
 * agent's bill, not to ration curiosity.
 *
 * Each namespace is its own counter, so a visitor who spent their chat
 * allowance can still send the form, and vice versa.
 */

export const HUB_QUOTAS = {
  /** Messages to the AI assistant. */
  chat: { namespace: "hubchat:anon:", limit: 60 },
  /** Lead submissions (form, home value, booking) across all hubs. */
  lead: { namespace: "hublead:anon:", limit: 12 },
  /** Interaction beacons. Cheap rows, but a loop should not write forever. */
  event: { namespace: "hubevent:anon:", limit: 400 },
} as const;

export type HubQuotaKind = keyof typeof HUB_QUOTAS;

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function hubSubjectKey(req: Request, namespace: string): string {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0]?.trim() || "unknown";
  const ua = req.headers.get("user-agent") || "unknown";
  return `${namespace}${createHash("sha256").update(`${ip}|${ua}`).digest("hex").slice(0, 24)}`;
}

/** Count one use. `allowed` is false once the day's limit is reached. */
export async function consumeHubQuota(
  req: Request,
  kind: HubQuotaKind,
): Promise<{ allowed: boolean; used: number }> {
  const { namespace, limit } = HUB_QUOTAS[kind];
  const key = hubSubjectKey(req, namespace);
  const today = todayDate();
  try {
    const { data: existing } = await supabaseServer
      .from("cma_daily_usage")
      .select("subject_key,cma_usage_count,last_reset_date")
      .eq("subject_key", key)
      .maybeSingle();

    if (!existing) {
      await supabaseServer.from("cma_daily_usage").insert({
        subject_key: key,
        user_id: null,
        role: "anonymous",
        cma_usage_count: 1,
        last_reset_date: today,
      } as Record<string, unknown>);
      return { allowed: true, used: 1 };
    }

    const row = existing as { cma_usage_count?: unknown; last_reset_date?: unknown };
    const sameDay = String(row.last_reset_date ?? "") === today;
    const current = sameDay ? Number(row.cma_usage_count ?? 0) : 0;
    if (current >= limit) return { allowed: false, used: current };

    await supabaseServer
      .from("cma_daily_usage")
      .update({
        cma_usage_count: current + 1,
        last_reset_date: today,
        updated_at: new Date().toISOString(),
      } as Record<string, unknown>)
      .eq("subject_key", key);
    return { allowed: true, used: current + 1 };
  } catch (e) {
    // A metering failure must not take the hub down — but it must not open
    // the gate either. Allow this one and say so in the log.
    console.warn(`[hub.usage:${kind}] metering failed:`, e instanceof Error ? e.message : e);
    return { allowed: true, used: 0 };
  }
}
