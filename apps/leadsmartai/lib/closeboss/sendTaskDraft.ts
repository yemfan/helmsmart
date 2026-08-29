import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSMS } from "@/lib/twilioSms";
import { sendEmail } from "@/lib/email";
import { toE164 } from "@/lib/missed-call/service";
import { logAssistantActivity } from "@/lib/closeboss/activities";
import { getAgentMessageSettingsEffective } from "@/lib/agent-messaging/settings";
import { quietHoursBlockReason, nextSendOpenAfter, type SendBlockReason } from "@/lib/agent-messaging/sendWindow";
import type { AssistantType } from "@/lib/closeboss/team";

/**
 * Sends a Boss instruction task's prepared draft (SMS via Twilio, email via
 * Resend), marks the row `sent`, and logs the activity. Shared by:
 *   - the manual approve route (the Realtor clicked "Approve & send"), and
 *   - autopilot (the assistant+channel is on auto, so it sends without asking).
 *
 * The ONLY difference between the two is `opts.auto`, which just changes the
 * activity wording — the send + bookkeeping are identical, so the approval and
 * autonomous paths can never drift apart.
 */

export type DraftedTask = {
  id: string;
  title: string;
  assigned_to: string;
  matched_contact_id: string | null;
  draft_channel: "sms" | "email" | null;
  draft_subject: string | null;
  draft_body: string | null;
  execution_note: string | null;
};

export type SendDraftedResult =
  | { ok: true; sentTo: string }
  | { ok: false; error: string; blocked?: SendBlockReason; sendAfter?: string };

export async function sendDraftedBossTask(
  agentId: string,
  task: DraftedTask,
  opts?: { auto?: boolean },
): Promise<SendDraftedResult> {
  if (!task.draft_body || !task.draft_channel) {
    return { ok: false, error: "This task has no draft awaiting approval." };
  }

  // Quiet-hours guard — AUTOPILOT ONLY. A manual approval (opts.auto falsy) is
  // the Realtor explicitly choosing to send now, so it's never blocked. An
  // autonomous send, though, must respect the agent's quiet hours / Sunday /
  // CNY pauses — otherwise autopilot could text a client at 2am. When blocked
  // we DON'T send; we report the block + the next open time so the caller can
  // schedule the message to go out then instead of dropping it.
  if (opts?.auto) {
    const settings = await getAgentMessageSettingsEffective(agentId);
    const blocked = settings ? quietHoursBlockReason(new Date(), settings) : null;
    if (blocked && settings) {
      return {
        ok: false,
        error: `Held (${blocked}) — scheduled for after quiet hours.`,
        blocked,
        sendAfter: nextSendOpenAfter(new Date(), blocked, settings).toISOString(),
      };
    }
  }

  let sentTo: string | null = null;
  if (task.draft_channel === "sms") {
    if (!task.matched_contact_id) return { ok: false, error: "No contact on this draft." };
    const { data: c } = await supabaseAdmin
      .from("contacts")
      .select("phone, name")
      .eq("id", task.matched_contact_id)
      .maybeSingle();
    const row = c as { phone: string | null; name: string | null } | null;
    const e164 = toE164(row?.phone ?? null);
    if (!e164) return { ok: false, error: "The contact has no valid US phone number." };
    await sendSMS(e164, task.draft_body, task.matched_contact_id);
    sentTo = row?.name ?? e164;
  } else {
    let to: string | null = null;
    let toName: string | null = null;
    if (task.matched_contact_id) {
      const { data: c } = await supabaseAdmin
        .from("contacts")
        .select("email, name")
        .eq("id", task.matched_contact_id)
        .maybeSingle();
      to = (c as { email: string | null } | null)?.email ?? null;
      toName = (c as { name: string | null } | null)?.name ?? null;
    }
    if (!to && task.execution_note?.startsWith("to:")) {
      to = task.execution_note.slice(3).split("|")[0].trim() || null;
    }
    if (!to) return { ok: false, error: "No email address on this draft." };
    await sendEmail({ to, subject: task.draft_subject ?? task.title, text: task.draft_body });
    sentTo = toName ?? to;
  }

  await supabaseAdmin
    .from("boss_instruction_tasks")
    .update({ status: "sent", executed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", task.id);

  void logAssistantActivity({
    agentId,
    assistantType: task.assigned_to as AssistantType,
    activityType: "boss_task_sent",
    summary: `${opts?.auto ? "Auto-sent" : "Sent"} the ${task.draft_channel === "sms" ? "text" : "email"} to ${sentTo}${opts?.auto ? " — on autopilot" : " — approved by you"}`,
    outcome: task.draft_body.length > 160 ? `${task.draft_body.slice(0, 157)}…` : task.draft_body,
    requiresAttention: false,
    relatedEntityType: task.matched_contact_id ? "contact" : null,
    relatedEntityId: task.matched_contact_id,
  });

  return { ok: true, sentTo: sentTo ?? "" };
}
