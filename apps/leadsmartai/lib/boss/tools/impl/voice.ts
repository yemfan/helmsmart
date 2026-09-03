import "server-only";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAgentMessageSettingsEffective } from "@/lib/agent-messaging/settings";
import { quietHoursBlockReason, nextSendOpenAfter } from "@/lib/agent-messaging/sendWindow";
import { defineTool } from "../types";

/**
 * schedule_voice_call — queues an outbound AI voice call on the
 * scheduled_actions rail (drained every 15 min by the outreach-scheduler
 * cron, same as the Sales composer). Quiet hours push the call to the next
 * open window instead of dialing at 2am. The executor enforces the
 * 1-call-per-contact-per-run cap and ask-mode approval.
 */
export const scheduleVoiceCall = defineTool({
  name: "schedule_voice_call",
  description:
    "Queue an outbound AI voice call to a CRM contact with a specific objective (e.g. qualify on budget/timeline, confirm a showing). The call is placed by the AI caller within ~15 minutes, or after quiet hours end. Max one call per contact per run.",
  inputSchema: z.object({
    contact_id: z.string().uuid(),
    objective: z
      .string()
      .min(8)
      .describe("What the call should accomplish and any facts the caller needs"),
  }),
  riskClass: "outbound",
  assignee: "sales_assistant",
  outbound: {
    channel: () => "call" as const,
    contactId: (input) => input.contact_id,
  },
  execute: async (ctx, input) => {
    const { data } = await supabaseAdmin
      .from("contacts")
      .select("id, name, phone")
      .eq("id", input.contact_id)
      .eq("agent_id", ctx.agentId)
      .maybeSingle();
    const contact = data as {
      id: string;
      name: string | null;
      phone: string | null;
    } | null;
    if (!contact) return { status: "failed", error: "Contact not found for this agent." };
    if (!contact.phone) {
      return { status: "failed", error: `${contact.name ?? "Contact"} has no phone number on file.` };
    }

    // Respect quiet hours even in auto mode — schedule into the open window.
    const now = ctx.now ?? new Date();
    let scheduledFor = new Date(now.getTime() + 2 * 60 * 1000);
    const settings = await getAgentMessageSettingsEffective(ctx.agentId);
    if (settings) {
      const blocked = quietHoursBlockReason(now, settings);
      if (blocked) scheduledFor = nextSendOpenAfter(now, blocked, settings);
    }

    const { error } = await supabaseAdmin.from("scheduled_actions").insert({
      agent_id: ctx.agentId,
      channel: "call",
      purpose: "follow_up",
      contact_ids: [contact.id],
      body: input.objective.slice(0, 1000),
      scheduled_for: scheduledFor.toISOString(),
      status: "scheduled",
    });
    if (error) return { status: "failed", error: "Couldn't queue the call." };
    return {
      status: "completed",
      summary: `AI call queued to ${contact.name ?? "the contact"} for ${scheduledFor.toISOString()} — ${input.objective.slice(0, 80)}`,
      display: {
        key: "voice.callQueued",
        params: {
          name: contact.name ?? "",
          when: scheduledFor.toISOString(),
          objective: input.objective.slice(0, 80),
        },
      },
      data: { contact_id: contact.id, scheduled_for: scheduledFor.toISOString() },
    };
  },
  propose: async (ctx, input) => {
    const { data } = await supabaseAdmin
      .from("contacts")
      .select("id, name")
      .eq("id", input.contact_id)
      .eq("agent_id", ctx.agentId)
      .maybeSingle();
    const contact = data as { id: string; name: string | null } | null;
    if (!contact) return { status: "failed", error: "Contact not found for this agent." };
    return {
      status: "pending_approval",
      summary: `Proposed AI call to ${contact.name ?? "contact"}: ${input.objective.slice(0, 100)}`,
      display: {
        key: "voice.callProposed",
        params: { name: contact.name ?? "", objective: input.objective.slice(0, 100) },
      },
      proposal: { contact_id: contact.id, objective: input.objective },
    };
  },
});
