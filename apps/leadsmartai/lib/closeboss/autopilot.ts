import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAgentMessageSettings, upsertAgentMessageSettings } from "@/lib/agent-messaging/settings";
import type { BossAssignee, BossChannel } from "@/lib/closeboss/actions/registry";

/**
 * Autopilot policy for the Boss Assistant.
 *
 * Two layers:
 *   - GLOBAL on/off — agent_message_settings.review_policy ("autosend" = on).
 *     This is the master switch the existing executor already honors.
 *   - PER-CHANNEL refinement — boss_autopilot_settings rows let the Realtor say
 *     "auto-text but ask before calling": a row with mode "auto"/"ask" overrides
 *     the global for that (assistant, channel). No row → fall back to global.
 *
 * `effectiveAutopilot` is the single decision the executor calls to know whether
 * to act on its own (auto) or prepare the work and ask for approval (ask).
 */

/**
 * Who has to bless an outbound action before it goes.
 *
 *   ask      — the realtor approves it. Nothing leaves without a human.
 *   assisted — Max proofreads and risk-checks it, and only bothers the realtor
 *              when he is not sure. The middle setting people actually want:
 *              not "read every text", not "send anything".
 *   auto     — it goes, subject to the usual compliance rails.
 *
 * The DB CHECK has allowed 'ask' | 'review' | 'assisted' | 'auto' all along;
 * only this type was narrower, so the middle tier needed no migration.
 * 'review' stays unused — 'assisted' says whose review it is.
 */
export type AutopilotMode = "ask" | "assisted" | "auto";

export type AutopilotCell = {
  assignee: BossAssignee;
  channel: BossChannel;
  mode: AutopilotMode;
};

/** The channels each assistant can act on — drives the settings matrix. */
export const AUTOPILOT_CHANNELS: Record<BossAssignee, BossChannel[]> = {
  receptionist: ["call", "sms"],
  sales_assistant: ["call", "sms", "email"],
  marketing_assistant: ["social", "email"],
  transaction_assistant: ["email"],
  accountant: ["email"],
};

async function globalAutopilot(agentId: string): Promise<boolean> {
  const s = await getAgentMessageSettings(agentId);
  return s.reviewPolicy === "autosend";
}

/**
 * Should the Boss act autonomously for this (assistant, channel)? A per-channel
 * row wins when present; otherwise the global review policy decides. Actions
 * with no outbound channel (CMA, presentation, scheduling) pass `channel`
 * undefined and resolve purely on the global policy.
 */
/**
 * The full three-way answer. `effectiveAutopilot` below is the boolean view of
 * this — true only for "auto" — and is left alone so every existing caller keeps
 * its current behaviour; a caller that has never heard of "assisted" must not
 * start treating it as autopilot.
 */
export async function resolveApprovalMode(
  agentId: string,
  assignee: BossAssignee,
  channel?: BossChannel,
): Promise<AutopilotMode> {
  const fallback: AutopilotMode = (await globalAutopilot(agentId)) ? "auto" : "ask";
  if (!channel) return fallback;
  try {
    const { data } = await supabaseAdmin
      .from("boss_autopilot_settings")
      .select("mode")
      .eq("agent_id", agentId)
      .eq("assignee", assignee)
      .eq("channel", channel)
      .maybeSingle();
    const mode = (data as { mode?: string } | null)?.mode;
    if (mode === "auto") return "auto";
    if (mode === "assisted") return "assisted";
    if (mode === "ask" || mode === "review") return "ask";
    return fallback;
  } catch {
    return fallback;
  }
}

export async function effectiveAutopilot(
  agentId: string,
  assignee: BossAssignee,
  channel?: BossChannel,
): Promise<boolean> {
  const fallback = await globalAutopilot(agentId);
  if (!channel) return fallback;
  try {
    const { data } = await supabaseAdmin
      .from("boss_autopilot_settings")
      .select("mode")
      .eq("agent_id", agentId)
      .eq("assignee", assignee)
      .eq("channel", channel)
      .maybeSingle();
    const mode = (data as { mode?: string } | null)?.mode;
    if (mode === "auto") return true;
    if (mode === "ask") return false;
    return fallback;
  } catch {
    return fallback;
  }
}

/** Every per-channel cell the Realtor has explicitly set. */
export async function getAutopilotMatrix(agentId: string): Promise<AutopilotCell[]> {
  try {
    const { data } = await supabaseAdmin
      .from("boss_autopilot_settings")
      .select("assignee, channel, mode")
      .eq("agent_id", agentId);
    return (data ?? []) as AutopilotCell[];
  } catch {
    return [];
  }
}

/** Set (or clear) one per-channel cell. */
export async function setAutopilotCell(
  agentId: string,
  assignee: BossAssignee,
  channel: BossChannel,
  mode: AutopilotMode,
): Promise<void> {
  await supabaseAdmin.from("boss_autopilot_settings").upsert(
    {
      agent_id: agentId,
      assignee,
      channel,
      mode,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "agent_id,assignee,channel" },
  );
}

/** Flip the global master switch (review policy). */
export async function setGlobalAutopilot(agentId: string, on: boolean): Promise<void> {
  await upsertAgentMessageSettings(agentId, { reviewPolicy: on ? "autosend" : "review" });
}

export async function getGlobalAutopilot(agentId: string): Promise<boolean> {
  return globalAutopilot(agentId);
}
