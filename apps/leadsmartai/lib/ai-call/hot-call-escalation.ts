import {
  notifyAgentOfHotLead,
  type NotifyAgentOfHotLeadParams,
} from "@/lib/ai-sms/notifications";
import { dispatchMobileNeedsHumanPush } from "@/lib/mobile/pushNotificationsService";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createVoiceHotFollowUpTask, resolveEffectiveAgentId } from "./hot-call-task";
import type { VoiceCallIntent } from "./types";
import { recordNurtureAlert } from "@/lib/nurture/recordAlert";

const NURTURE_HOT_DEDUPE_MS = 24 * 60 * 60 * 1000;

async function insertVoiceHotNurtureAlertIfNeeded(params: {
  agentId: string;
  leadId: string;
  summary: string;
  needsHuman: boolean;
}): Promise<void> {
  const since = new Date(Date.now() - NURTURE_HOT_DEDUPE_MS).toISOString();
  const { data: existing } = await supabaseAdmin
    .from("nurture_alerts")
    .select("id")
    .eq("contact_id", params.leadId as never)
    .eq("agent_id", params.agentId as never)
    .eq("type", "hot")
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return;

  const prefix = params.needsHuman ? "Inbound voice — needs human" : "Inbound voice — hot lead";
  const msg = `${prefix}: ${params.summary.trim().slice(0, 200)}`;
  try {
    await recordNurtureAlert({ agentId: params.agentId, contactId: params.leadId, type: "hot", message: msg }, supabaseAdmin);
  } catch {
    // ignore
  }
}

async function logLeadEventBestEffort(params: {
  leadId: string;
  agentId: string | null;
  eventType: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const agentId = await resolveEffectiveAgentId(params.leadId, params.agentId);
  try {
    await supabaseAdmin.from("contact_events").insert({
      contact_id: params.leadId as never,
      agent_id: agentId as never,
      event_type: params.eventType,
      metadata: params.metadata,
    } as Record<string, unknown>);
  } catch {
    // ignore
  }
}

export type HotVoiceEscalationInput = {
  leadId: string;
  callAgentId: string | null;
  twilioCallSid: string;
  /** Same as `lead_calls.hot_lead` / analysis hot flag. */
  hot: boolean;
  needsHuman: boolean;
  summary: string;
  speechResult: string;
  inferredIntent: VoiceCallIntent;
  intentRole: string;
};

/**
 * Hot inbound voice escalation: `lead_tasks` follow-up, nurture inbox, hot-lead SMS + push,
 * needs-human push, and consolidated `lead_events` audit rows (`voice_hot_escalation_*`).
 *
 * Uses `notifyAgentOfHotLead` (outbound SMS when enabled) and existing mobile hot push inside it.
 */
export async function escalateHotInboundVoiceCall(params: HotVoiceEscalationInput): Promise<void> {
  if (!params.hot && !params.needsHuman) return;

  const agentId = await resolveEffectiveAgentId(params.leadId, params.callAgentId);

  const { data: leadRow } = await supabaseAdmin
    .from("contacts")
    .select("name")
    .eq("id", params.leadId as never)
    .maybeSingle();
  const leadName =
    leadRow != null && (leadRow as { name?: string | null }).name != null
      ? String((leadRow as { name: string }).name)
      : null;

  const taskResult = await createVoiceHotFollowUpTask({
    leadId: params.leadId,
    callAgentId: params.callAgentId,
    twilioCallSid: params.twilioCallSid,
    needsHuman: params.needsHuman,
    hotLead: params.hot,
    summary: params.summary,
    transcriptPreview: params.speechResult,
    inferredIntent: params.inferredIntent,
    intentRole: params.intentRole,
  });

  if (agentId) {
    await insertVoiceHotNurtureAlertIfNeeded({
      agentId,
      leadId: params.leadId,
      summary: params.summary,
      needsHuman: params.needsHuman,
    });
  }

  let needsHumanPushAttempted = false;
  if (params.needsHuman && agentId) {
    needsHumanPushAttempted = true;
    try {
      await dispatchMobileNeedsHumanPush({
        agentId,
        leadId: params.leadId,
        leadName,
        channel: "voice",
        reason: `Voice · ${params.inferredIntent || params.intentRole}`,
      });
      await logLeadEventBestEffort({
        leadId: params.leadId,
        agentId,
        eventType: "voice_hot_escalation_needs_human_push",
        metadata: {
          twilio_call_sid: params.twilioCallSid,
          source: "ai_voice",
        },
      });
    } catch {
      // push optional
    }
  }

  const hotNotifyPayload: NotifyAgentOfHotLeadParams = {
    leadId: params.leadId,
    reason: params.needsHuman ? "needs_human" : "voice_hot_lead",
    latestMessage: params.speechResult,
    source: "ai_voice",
  };
  const notifyResult = agentId
    ? await notifyAgentOfHotLead(hotNotifyPayload)
    : { notified: false as const, reason: "no_assigned_agent" as const };

  const notifyMeta: Record<string, unknown> = {
    twilio_call_sid: params.twilioCallSid,
    source: "ai_voice",
    task_created: taskResult.created,
    task_id: taskResult.taskId ?? null,
    needs_human_push: needsHumanPushAttempted,
  };
  if ("notified" in notifyResult) notifyMeta.notified = notifyResult.notified;
  if ("channel" in notifyResult) notifyMeta.channel = notifyResult.channel;
  if ("reason" in notifyResult) notifyMeta.reason = notifyResult.reason;

  await logLeadEventBestEffort({
    leadId: params.leadId,
    agentId,
    eventType: "voice_hot_escalation_agent_notify",
    metadata: notifyMeta,
  });
}

/** Backward-compatible name for {@link escalateHotInboundVoiceCall}. */
export const handleVoiceHotLeadSideEffects = escalateHotInboundVoiceCall;
