import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canPlaceVoiceCall } from "./limits";

/**
 * Thrown by the outbound-call chokepoint when the owning agent has no AI
 * voice minutes left this month. Carries the usage numbers so routes can
 * surface a clean 402 with an upgrade prompt.
 */
export class VoiceMinutesExceededError extends Error {
  readonly code = "voice_minutes_limit_reached" as const;
  readonly used: number;
  readonly limit: number | null;
  readonly plan: string | null;
  constructor(
    message: string,
    opts: { used: number; limit: number | null; plan: string | null },
  ) {
    super(message);
    this.name = "VoiceMinutesExceededError";
    this.used = opts.used;
    this.limit = opts.limit;
    this.plan = opts.plan;
  }
}

/**
 * Enforce the monthly AI voice-minute cap before placing an outbound call.
 *
 * Throws `VoiceMinutesExceededError` ONLY when the cap is genuinely exhausted.
 * Everything else — unresolvable agent, no entitlement row, or an infra error
 * reading usage — fails OPEN (returns without throwing) so the cap rollout
 * can't silently break calling for agents the entitlement system doesn't yet
 * cover. Unlimited plans (NULL cap) are always allowed.
 */
export async function assertVoiceMinutesAvailableForAgent(
  agentId: string | number,
): Promise<void> {
  let check;
  try {
    const idNum = Number(agentId);
    if (!Number.isFinite(idNum)) return;
    const { data } = await supabaseAdmin
      .from("agents")
      .select("auth_user_id")
      .eq("id", idNum as never)
      .maybeSingle();
    const userId = (data as { auth_user_id?: string | null } | null)?.auth_user_id;
    if (!userId) return;
    check = await canPlaceVoiceCall(supabaseAdmin as unknown as SupabaseClient, userId);
  } catch (e) {
    console.error("voiceMinuteGate: usage check failed — allowing call", e);
    return; // fail-open on infra error
  }

  if (!check.allowed && check.reasonCode === "voice_minutes_limit_reached") {
    throw new VoiceMinutesExceededError(
      check.reason ?? "You've reached your AI voice minutes for this month.",
      {
        used: Number(check.currentUsage?.voiceMinutesThisMonth ?? 0),
        limit: check.limit,
        plan: check.plan,
      },
    );
  }
}
