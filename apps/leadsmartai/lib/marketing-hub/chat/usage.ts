import "server-only";

import { createHash } from "node:crypto";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * How much a stranger may talk to an agent's AI assistant in a day.
 *
 * Same mechanism as the public house search (`lib/house-search/publicUsage`):
 * one `cma_daily_usage` row per hashed (ip | user-agent), reset daily. The
 * limit is generous — a real buyer asking twenty questions is exactly who the
 * page is for — and exists to bound the bill from a script, not to ration
 * curiosity. The per-conversation cap in the route bounds a single runaway
 * thread the same way.
 *
 * Keyed with its own namespace so a visitor who has used their one free house
 * search is not also locked out of the chat, and vice versa.
 */

export const HUB_CHAT_DAILY_LIMIT = 60;
const NAMESPACE = "hubchat:anon:";

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function chatSubjectKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0]?.trim() || "unknown";
  const ua = req.headers.get("user-agent") || "unknown";
  return `${NAMESPACE}${createHash("sha256").update(`${ip}|${ua}`).digest("hex").slice(0, 24)}`;
}

/** Count one message. Returns true when the visitor is still within the limit. */
export async function consumeHubChatMessage(req: Request): Promise<{ allowed: boolean; used: number }> {
  const key = chatSubjectKey(req);
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
    if (current >= HUB_CHAT_DAILY_LIMIT) return { allowed: false, used: current };

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
    // A metering failure must not take the assistant down — but it must not
    // open the gate either. Allow the message and say so in the log.
    console.warn("[hub.chat] usage metering failed:", e instanceof Error ? e.message : e);
    return { allowed: true, used: 0 };
  }
}
