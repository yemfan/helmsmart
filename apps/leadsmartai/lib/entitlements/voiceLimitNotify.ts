import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail, EMAIL_BRAND } from "@/lib/email";
import { canPlaceVoiceCall } from "./limits";

/** Notify the agent once they cross this fraction of their monthly allotment. */
const NOTIFY_THRESHOLD = 0.8;

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://www.closebossai.com").replace(/\/$/, "");
}

/**
 * Email the agent — at most once per calendar month — when they cross ~80% of
 * their included AI voice minutes, surfacing their over-limit choice (text-back
 * / overage / upgrade). Fully guarded + best-effort: any failure is swallowed
 * so it can never affect call metering. No-op for unlimited/unknown caps.
 */
export async function maybeNotifyApproachingVoiceLimit(
  userId: string,
  agentId: string,
): Promise<void> {
  try {
    const check = await canPlaceVoiceCall(supabaseAdmin, userId);
    const cap = typeof check.limit === "number" ? check.limit : null;
    if (cap == null || cap <= 0) return; // unlimited or unknown — nothing to warn about
    const used =
      (check.currentUsage as { voiceMinutesThisMonth?: number } | undefined)
        ?.voiceMinutesThisMonth ?? 0;
    if (used < cap * NOTIFY_THRESHOLD) return;

    const period = new Date().toISOString().slice(0, 7); // YYYY-MM (UTC)

    const { data: row } = await supabaseAdmin
      .from("voice_receptionist_settings")
      .select("voice_limit_notified_period, voice_limit_behavior")
      .eq("agent_id", agentId as never)
      .maybeSingle();
    const r = row as
      | { voice_limit_notified_period?: string | null; voice_limit_behavior?: string | null }
      | null;
    if (r?.voice_limit_notified_period === period) return; // already warned this month

    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = userData?.user?.email;
    if (!email) return;

    const behavior = r?.voice_limit_behavior === "overage" ? "overage" : "text_back";
    const behaviorLabel =
      behavior === "overage"
        ? "keep the AI answering (additional minutes billed at $0.25/min)"
        : "text callers back instead (no extra charge)";
    const settingsUrl = `${siteBase()}/dashboard/settings`;

    await sendEmail({
      to: email,
      subject: `You've used ${used} of ${cap} AI voice minutes this month`,
      text: `You've used ${used} of your ${cap} included AI voice minutes this month.

When you run out, your receptionist is currently set to: ${behaviorLabel}.

Choose what happens when you hit the limit:
• Text callers back — the AI stops answering live and sends an SMS (no extra charge)
• Keep the AI answering — additional minutes billed at $0.25/min
• Upgrade your plan for more included minutes

Manage this anytime in Settings → Voice Receptionist:
${settingsUrl}

— ${EMAIL_BRAND}`,
    });

    // Mark notified for this period. Upsert so an agent with no settings row yet
    // still dedupes (other columns take their table defaults).
    await supabaseAdmin.from("voice_receptionist_settings").upsert(
      {
        agent_id: agentId as never,
        voice_limit_notified_period: period,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "agent_id" },
    );
  } catch {
    // best-effort — never let a notification failure affect call metering
  }
}
