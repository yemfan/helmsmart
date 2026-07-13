import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { PRODUCT_LEADSMART_AGENT } from "@/lib/entitlements/product";
import { incrementUsage } from "./adminUsage";
import { maybeNotifyApproachingVoiceLimit } from "./voiceLimitNotify";

/**
 * Convert a call's wall-clock duration into billable AI-voice minutes.
 *
 * Metered in WHOLE MINUTES, rounded UP (telco convention): any connected
 * call bills at least 1 minute, a 61-second call bills 2, etc. Zero/negative
 * durations (unanswered / no-answer) bill nothing.
 */
export function billableVoiceMinutes(durationSeconds: number | null | undefined): number {
  if (typeof durationSeconds !== "number" || durationSeconds <= 0) return 0;
  return Math.ceil(durationSeconds / 60);
}

/**
 * Record AI-voice usage against the owning agent's monthly entitlement,
 * counted in whole minutes (see `billableVoiceMinutes`). Resolves the
 * bigint `agents.id` to the auth user id that entitlements are keyed on.
 * Best-effort — callers should not let a metering failure break the call
 * webhook.
 */
export async function recordVoiceUsageForAgent(
  agentId: string | number,
  durationSeconds: number | null | undefined
): Promise<number> {
  const minutes = billableVoiceMinutes(durationSeconds);
  if (minutes <= 0) return 0;

  const idNum = Number(agentId);
  if (!Number.isFinite(idNum)) return 0;

  const { data } = await supabaseAdmin
    .from("agents")
    .select("auth_user_id")
    .eq("id", idNum as never)
    .maybeSingle();
  const userId = (data as { auth_user_id?: string | null } | null)?.auth_user_id;
  if (!userId) return 0;

  await incrementUsage(userId, "voice_minutes_used", PRODUCT_LEADSMART_AGENT, minutes);

  // Heads-up email when the agent crosses ~80% of their monthly allotment
  // (once/month, best-effort — never blocks metering).
  await maybeNotifyApproachingVoiceLimit(userId, String(agentId)).catch(() => {});

  return minutes;
}
