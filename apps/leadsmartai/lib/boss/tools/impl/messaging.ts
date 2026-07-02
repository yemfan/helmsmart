import "server-only";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAnthropicClient } from "@/lib/anthropic";
import { BOSS_AGENT_MODEL } from "@/lib/ai/config";
import { dispatchApprovedDrafts } from "@/lib/drafts/sender";
import { sendOutboundSms } from "@/lib/ai-sms/outbound";
import { sendOutboundEmail } from "@/lib/ai-email/send";
import { getAgentMessageSettingsEffective } from "@/lib/agent-messaging/settings";
import { quietHoursBlockReason, nextSendOpenAfter } from "@/lib/agent-messaging/sendWindow";
import { defineTool } from "../types";

/**
 * draft_message — writes a message_drafts row (status 'pending'). Drafting is
 * riskClass "draft": always allowed, never sends.
 *
 * send_message — riskClass "outbound". The executor resolves autopilot: ask
 * mode routes to propose() (draft stays pending for the approval inbox); auto
 * mode approves + dispatches via the shared drafts dispatcher, which enforces
 * quiet hours (defers), per-contact daily caps (defers), and do-not-contact
 * (fails the draft) — the same rails every other autosend path uses.
 */

async function loadContact(agentId: string, contactId: string) {
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("id, name, first_name, phone, phone_number, email, notes")
    .eq("id", contactId)
    .eq("agent_id", agentId)
    .maybeSingle();
  return data as {
    id: string;
    name: string | null;
    first_name: string | null;
    phone: string | null;
    phone_number: string | null;
    email: string | null;
    notes: string | null;
  } | null;
}

export const draftMessage = defineTool({
  name: "draft_message",
  description:
    "Draft an SMS or email to a CRM contact (does NOT send). Writes a pending draft the realtor can approve, or that send_message can dispatch when autopilot allows. Returns the draft_id.",
  inputSchema: z.object({
    contact_id: z.string().uuid(),
    channel: z.enum(["sms", "email"]),
    intent: z
      .string()
      .min(3)
      .describe("What the message should accomplish, e.g. 'follow up on Saturday's showing'"),
    context: z
      .string()
      .optional()
      .describe("Facts to use — listing details, prior conversation, deadlines. Never invent facts."),
  }),
  riskClass: "draft",
  assignee: "sales_assistant",
  execute: async (ctx, input) => {
    const contact = await loadContact(ctx.agentId, input.contact_id);
    if (!contact) return { status: "failed", error: "Contact not found for this agent." };
    if (input.channel === "sms" && !contact.phone_number && !contact.phone) {
      return { status: "failed", error: "Contact has no phone number on file." };
    }
    if (input.channel === "email" && !contact.email) {
      return { status: "failed", error: "Contact has no email address on file." };
    }

    const { data: agentRow } = await supabaseAdmin
      .from("agents")
      .select("brand_name")
      .eq("id", ctx.agentId)
      .maybeSingle();
    const agentName = (agentRow as { brand_name?: string | null } | null)?.brand_name ?? null;
    const recipient = contact.first_name ?? contact.name ?? null;

    const client = getAnthropicClient();
    const system = `You draft outbound messages for a real estate professional's AI team. Write in FIRST PERSON as the Realtor${agentName ? ` (${agentName})` : ""} — warm, professional, concise, never pushy.

Rules:
- ${input.channel === "sms" ? "SMS: max 300 characters, plain text, no subject, 0-1 emoji." : "Email: a short subject and a 3-6 sentence body, plain text."}
- Use ONLY the facts provided. Never invent prices, dates, addresses, or amounts.
- Address the recipient by first name when known.

Output ONLY a JSON object: { "subject": ${input.channel === "email" ? '"string"' : "null"}, "body": "string" }`;
    const user = [
      `Goal: ${input.intent}`,
      recipient ? `Recipient: ${recipient}` : null,
      input.context ? `Facts: ${input.context.slice(0, 800)}` : null,
      contact.notes ? `What we know about them: ${contact.notes.slice(0, 400)}` : null,
      "",
      "Write the message now. Return only the JSON object.",
    ]
      .filter((l) => l !== null)
      .join("\n");

    const response = await client.messages.create({
      model: BOSS_AGENT_MODEL,
      max_tokens: 600,
      system,
      messages: [{ role: "user", content: user }],
    });
    const tb = response.content.find((b) => b.type === "text");
    if (!tb || tb.type !== "text") return { status: "failed", error: "Drafter returned no text." };
    const text = tb.text.replace(/```(?:json)?|```/g, "");
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first < 0 || last <= first) return { status: "failed", error: "Drafter returned non-JSON." };
    let subject: string | null = null;
    let body = "";
    try {
      const raw = JSON.parse(text.slice(first, last + 1)) as { subject?: unknown; body?: unknown };
      body = typeof raw.body === "string" ? raw.body.trim() : "";
      subject =
        typeof raw.subject === "string" && raw.subject.trim()
          ? raw.subject.trim().slice(0, 200)
          : null;
    } catch {
      return { status: "failed", error: "Drafter returned unparseable JSON." };
    }
    if (!body) return { status: "failed", error: "Drafter returned an empty body." };
    body = body.slice(0, input.channel === "sms" ? 320 : 4000);

    const { data: draft, error } = await supabaseAdmin
      .from("message_drafts")
      .insert({
        agent_id: ctx.agentId,
        contact_id: input.contact_id,
        channel: input.channel,
        subject,
        body,
        status: "pending",
        trigger_context: { source: "boss_tool", run_id: ctx.runId, intent: input.intent },
      })
      .select("id")
      .single();
    if (error || !draft) {
      return { status: "failed", error: error?.message ?? "Couldn't save the draft." };
    }
    return {
      status: "completed",
      summary: `Drafted ${input.channel} to ${recipient ?? "contact"}: "${body.slice(0, 80)}${body.length > 80 ? "…" : ""}"`,
      data: { draft_id: (draft as { id: string }).id, subject, body },
    };
  },
});

const sendMessageInput = z.object({
  draft_id: z.string().uuid().describe("A message_drafts id produced by draft_message"),
  channel: z.enum(["sms", "email"]).describe("Must match the draft's channel"),
  contact_id: z.string().uuid().describe("Must match the draft's contact"),
});

export const sendMessage = defineTool({
  name: "send_message",
  description:
    "Send a previously drafted message (from draft_message). In ask mode this parks the draft for the realtor's approval instead of sending. Sending respects quiet hours, per-contact daily caps, and opt-outs.",
  inputSchema: sendMessageInput,
  riskClass: "outbound",
  assignee: "sales_assistant",
  outbound: {
    channel: (input) => input.channel,
    contactId: (input) => input.contact_id,
  },
  execute: async (ctx, input) => {
    // Auto mode: verify the declared channel/contact against the row (the
    // model can't route around a stricter autopilot cell by mislabeling).
    const { data } = await supabaseAdmin
      .from("message_drafts")
      .select("id, channel, contact_id, status, subject, body")
      .eq("id", input.draft_id)
      .eq("agent_id", ctx.agentId)
      .maybeSingle();
    const draft = data as {
      id: string;
      channel: string;
      contact_id: string;
      status: string;
      subject: string | null;
      body: string;
    } | null;
    if (!draft) return { status: "failed", error: "Draft not found for this agent." };
    if (draft.channel !== input.channel || draft.contact_id !== input.contact_id) {
      return {
        status: "failed",
        error: "Declared channel/contact don't match the draft — re-check the draft_id.",
      };
    }
    if (draft.status !== "pending" && draft.status !== "approved") {
      return { status: "failed", error: `Draft is already ${draft.status}.` };
    }

    if (draft.status === "pending") {
      await supabaseAdmin
        .from("message_drafts")
        .update({ status: "approved", approved_at: new Date().toISOString() })
        .eq("id", draft.id);
    }

    // The drafts dispatcher rail only serves SPHERE contacts (sphere_contacts
    // is a lifecycle-filtered view). Leads go out on the consolidated outreach
    // rail below instead.
    const { data: c } = await supabaseAdmin
      .from("contacts")
      .select("id, name, lifecycle_stage, phone, phone_number, email")
      .eq("id", draft.contact_id)
      .eq("agent_id", ctx.agentId)
      .maybeSingle();
    const contact = c as {
      id: string;
      name: string | null;
      lifecycle_stage: string | null;
      phone: string | null;
      phone_number: string | null;
      email: string | null;
    } | null;
    if (!contact) return { status: "failed", error: "Contact not found for this agent." };

    const isSphere = ["past_client", "sphere", "referral_source"].includes(
      contact.lifecycle_stage ?? "",
    );
    if (isSphere) {
      const result = await dispatchApprovedDrafts({ agentId: ctx.agentId, draftId: draft.id });
      const outcome = result.outcomes[0];
      if (!outcome) return { status: "failed", error: "Dispatcher found nothing to send." };
      if (outcome.reason === "sent") {
        return { status: "completed", summary: `Sent the ${input.channel} (draft ${draft.id}).` };
      }
      if (outcome.reason === "do_not_contact" || outcome.reason === "missing_address") {
        return { status: "rejected", reason: `Send blocked: ${outcome.reason}.` };
      }
      if (outcome.reason === "send_failed") {
        return { status: "failed", error: outcome.detail ?? "Send failed." };
      }
      // Deferred (quiet hours / caps / paused-on-reply) — dispatcher rescheduled it.
      return {
        status: "completed",
        summary: `Send deferred (${outcome.reason}) — the dispatcher will send it when the window opens.`,
      };
    }

    // ── lead send (outreach rail) ────────────────────────────────────
    const now = ctx.now ?? new Date();
    if (!ctx.approvedByRealtor) {
      // Autonomous sends respect quiet hours: defer onto scheduled_actions
      // (drained every 15 min), same as the Boss autopilot deferral path.
      // Explicit human approvals send now — the realtor chose the moment.
      const settings = await getAgentMessageSettingsEffective(ctx.agentId);
      const blocked = settings ? quietHoursBlockReason(now, settings) : null;
      if (blocked && settings) {
        const sendAfter = nextSendOpenAfter(now, blocked, settings);
        await supabaseAdmin.from("scheduled_actions").insert({
          agent_id: ctx.agentId,
          channel: input.channel,
          purpose: "follow_up",
          contact_ids: [contact.id],
          subject: draft.subject,
          body: draft.body,
          scheduled_for: sendAfter.toISOString(),
          status: "scheduled",
        });
        // Draft stays `approved` with scheduled_for as provenance; the
        // scheduled action owns the actual send (cancellable from the strip).
        await supabaseAdmin
          .from("message_drafts")
          .update({ scheduled_for: sendAfter.toISOString() })
          .eq("id", draft.id);
        return {
          status: "completed",
          summary: `Send deferred (${blocked}) — queued for ${sendAfter.toISOString()}.`,
        };
      }
    }

    try {
      if (input.channel === "sms") {
        const phone = contact.phone_number ?? contact.phone;
        if (!phone) return { status: "rejected", reason: "Contact has no phone number." };
        await sendOutboundSms({
          leadId: contact.id,
          to: phone,
          body: draft.body,
          agentId: ctx.agentId,
          actorType: "ai",
          assistantType: "sales_assistant",
        });
      } else {
        if (!contact.email) return { status: "rejected", reason: "Contact has no email address." };
        await sendOutboundEmail({
          leadId: contact.id,
          to: contact.email,
          subject: draft.subject ?? "Quick note",
          body: draft.body,
          agentId: ctx.agentId,
          actorType: "ai",
        });
      }
    } catch (e) {
      await supabaseAdmin
        .from("message_drafts")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          failure_reason: e instanceof Error ? e.message.slice(0, 300) : "send failed",
        })
        .eq("id", draft.id);
      return { status: "failed", error: e instanceof Error ? e.message : "Send failed." };
    }
    await supabaseAdmin
      .from("message_drafts")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", draft.id);
    return {
      status: "completed",
      summary: `Sent the ${input.channel} to ${contact.name ?? "the contact"}.`,
    };
  },
  propose: async (ctx, input) => {
    const { data } = await supabaseAdmin
      .from("message_drafts")
      .select("id, status, body")
      .eq("id", input.draft_id)
      .eq("agent_id", ctx.agentId)
      .maybeSingle();
    const draft = data as { id: string; status: string; body: string } | null;
    if (!draft) return { status: "failed", error: "Draft not found for this agent." };
    if (draft.status !== "pending") {
      return { status: "failed", error: `Draft is already ${draft.status}.` };
    }
    return {
      status: "pending_approval",
      summary: `Draft ready for your approval: "${draft.body.slice(0, 80)}${draft.body.length > 80 ? "…" : ""}"`,
      proposal: { draft_id: draft.id, channel: input.channel, contact_id: input.contact_id },
    };
  },
});
