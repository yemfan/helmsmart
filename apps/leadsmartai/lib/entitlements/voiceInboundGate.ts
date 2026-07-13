import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getReceptionistConfig } from "@/lib/voice-receptionist/settings";
import { canPlaceVoiceCall } from "./limits";

/**
 * Decide whether an inbound call should be handed to SMS text-back instead of
 * answered live by the AI, based on the owning agent's remaining monthly voice
 * minutes and their over-limit choice (`voice_limit_behavior`):
 *
 *   - within the allotment            → answer (false)
 *   - over, no-overage tier (Starter) → text back (true, hard cap)
 *   - over, overage tier + "text_back" → text back (true, agent chose not to pay)
 *   - over, overage tier + "overage"   → answer (false, accrues billable minutes)
 *
 * Best-effort: any lookup error resolves to `false` (never block a call on a
 * metering hiccup). The bigint `agents.id` is resolved to the auth user id that
 * entitlements are keyed on.
 */
export async function shouldTextBackInsteadOfAnswer(
  agentId: string | number,
): Promise<boolean> {
  try {
    const idNum = Number(agentId);
    if (!Number.isFinite(idNum)) return false;

    const { data } = await supabaseAdmin
      .from("agents")
      .select("auth_user_id")
      .eq("id", idNum as never)
      .maybeSingle();
    const userId = (data as { auth_user_id?: string | null } | null)?.auth_user_id;
    if (!userId) return false;

    const check = await canPlaceVoiceCall(supabaseAdmin, userId);

    // Hard cap (no-overage tier at/over its allotment).
    if (check.allowed === false) return true;

    // Over the allotment on an overage-capable tier: honor the agent's choice.
    const overMinutes =
      (check.currentUsage as { voiceOverageMinutes?: number } | undefined)
        ?.voiceOverageMinutes ?? 0;
    if (overMinutes > 0) {
      const cfg = await getReceptionistConfig(String(agentId));
      return cfg.voiceLimitBehavior === "text_back";
    }

    return false;
  } catch {
    return false;
  }
}
