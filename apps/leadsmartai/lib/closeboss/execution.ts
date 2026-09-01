import "server-only";

import { getAnthropicClient } from "@/lib/anthropic";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { effectiveAutopilot } from "@/lib/closeboss/autopilot";
import { sendDraftedBossTask } from "@/lib/closeboss/sendTaskDraft";
import type { SendBlockReason } from "@/lib/agent-messaging/sendWindow";
import type { ParsedTask } from "@/lib/closeboss/instructions";

/**
 * Boss instruction task EXECUTION — phase 1 of the unfrozen
 * AI-workforce loop.
 *
 * When the Boss routes a messaging task to the Sales Assistant
 * (text/email a lead) or the Accountant (chase a receivable), the
 * assistant drafts the REAL message here: match the contact (or
 * invoice), pick the channel, write the body, and park it on the
 * task as `awaiting_approval`. The Realtor approves on the Boss card
 * and it actually sends (see the instruction-tasks API route) —
 * nothing ever sends without approval.
 *
 * Tasks we can't execute confidently (no contact match, ambiguous
 * name, missing phone/email) stay `assigned` — visible on the
 * assistant's desk, untouched.
 */

const MODEL = "claude-sonnet-4-6";

type MatchedContact = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

/** Fuzzy single-match contact lookup. Two+ hits = ambiguous = no match. */
async function matchContactByName(
  agentId: string,
  rawName: string,
): Promise<MatchedContact | null> {
  const name = rawName.trim();
  if (name.length < 2) return null;
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("id, name, first_name, last_name, phone, email, notes")
    .eq("agent_id", agentId)
    .ilike("name", `%${name}%`)
    .limit(2);
  type Row = {
    id: string;
    name: string | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
    notes: string | null;
  };
  let rows = (data ?? []) as Row[];
  if (rows.length === 0) {
    // Try first name only ("Jane" → "Jane Chen").
    const first = name.split(/\s+/)[0];
    if (first && first.length >= 2 && first !== name) {
      const { data: byFirst } = await supabaseAdmin
        .from("contacts")
        .select("id, name, first_name, last_name, phone, email, notes")
        .eq("agent_id", agentId)
        .ilike("name", `${first}%`)
        .limit(2);
      rows = (byFirst ?? []) as Row[];
    }
  }
  if (rows.length !== 1) return null; // none or ambiguous
  const r = rows[0];
  return {
    id: r.id,
    name:
      r.first_name || r.last_name
        ? `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim()
        : r.name,
    phone: r.phone ?? null,
    email: r.email,
    notes: r.notes,
  };
}

async function draftMessage(args: {
  channel: "sms" | "email";
  voice: "sales" | "accountant";
  agentName: string | null;
  recipientName: string | null;
  taskTitle: string;
  taskDetails: string | null;
  context: string | null;
}): Promise<{ subject: string | null; body: string }> {
  const client = getAnthropicClient();
  const system = `You draft outbound messages for a real estate professional's AI team. Write in FIRST PERSON as the Realtor${args.agentName ? ` (${args.agentName})` : ""} — warm, professional, concise, never pushy.

${
  args.voice === "sales"
    ? "This is a Sales Assistant message to a lead or client: helpful first, one clear next step, no pressure."
    : "This is an Accountant follow-up on money owed: precise and courteous — reference what's owed and ask about timing, never nag."
}

Rules:
- ${args.channel === "sms" ? "SMS: max 300 characters, plain text, no subject, 0-1 emoji." : "Email: a short subject and a 3-6 sentence body, plain text."}
- Use ONLY the facts provided. Never invent prices, dates, addresses, or amounts.
- Address the recipient by first name when known.

Output ONLY a JSON object: { "subject": ${args.channel === "email" ? '"string"' : "null"}, "body": "string" }`;

  const user = [
    `Task: ${args.taskTitle}`,
    args.taskDetails ? `Details: ${args.taskDetails}` : null,
    args.recipientName ? `Recipient: ${args.recipientName}` : null,
    args.context ? `What we know about them: ${args.context.slice(0, 500)}` : null,
    "",
    "Write the message now. Return only the JSON object.",
  ]
    .filter((l) => l !== null)
    .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    system,
    messages: [{ role: "user", content: user }],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Drafter returned no text");
  const text = textBlock.text.replace(/```(?:json)?|```/g, "");
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("Drafter returned non-JSON");
  const raw = JSON.parse(text.slice(first, last + 1)) as { subject?: unknown; body?: unknown };
  const body = typeof raw.body === "string" ? raw.body.trim() : "";
  if (!body) throw new Error("Drafter returned empty body");
  return {
    subject: typeof raw.subject === "string" && raw.subject.trim() ? raw.subject.trim().slice(0, 200) : null,
    body: body.slice(0, args.channel === "sms" ? 320 : 4000),
  };
}

async function agentDisplayName(agentId: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from("agents")
      .select("brand_name")
      .eq("id", agentId)
      .maybeSingle();
    return (data as { brand_name?: string | null } | null)?.brand_name ?? null;
  } catch {
    return null;
  }
}

/**
 * Attempt execution for a freshly routed task. Returns the updated
 * status — `awaiting_approval` when a draft was produced, `assigned`
 * when we couldn't execute confidently. Best-effort: any error leaves
 * the task `assigned` rather than failing the instruction.
 */
export async function tryExecuteTask(args: {
  agentId: string;
  taskId: string;
  task: ParsedTask;
}): Promise<"awaiting_approval" | "assigned" | "sent" | "scheduled"> {
  const { agentId, taskId, task } = args;
  try {
    if (task.assignee === "sales_assistant") {
      if (!task.contact_name) return "assigned";
      const contact = await matchContactByName(agentId, task.contact_name);
      if (!contact) return "assigned";
      const channel: "sms" | "email" =
        task.channel === "email" || (!contact.phone && contact.email) ? "email" : "sms";
      if (channel === "sms" && !contact.phone) return "assigned";
      if (channel === "email" && !contact.email) return "assigned";

      const draft = await draftMessage({
        channel,
        voice: "sales",
        agentName: await agentDisplayName(agentId),
        recipientName: contact.name,
        taskTitle: task.title,
        taskDetails: task.details,
        context: contact.notes,
      });
      const executionNote = contact.name ? `To ${contact.name}` : null;
      await supabaseAdmin
        .from("boss_instruction_tasks")
        .update({
          status: "awaiting_approval",
          matched_contact_id: contact.id,
          draft_channel: channel,
          draft_subject: draft.subject,
          draft_body: draft.body,
          execution_note: executionNote,
          updated_at: new Date().toISOString(),
        })
        .eq("id", taskId);

      // Autopilot: when this assistant+channel is on auto, send now instead of
      // parking it for approval. Falls back to awaiting_approval if the send
      // can't complete (e.g. missing phone) so it never silently disappears.
      if (await effectiveAutopilot(agentId, "sales_assistant", channel)) {
        const sent = await sendDraftedBossTask(
          agentId,
          {
            id: taskId,
            title: task.title,
            assigned_to: "sales_assistant",
            matched_contact_id: contact.id,
            draft_channel: channel,
            draft_subject: draft.subject,
            draft_body: draft.body,
            execution_note: executionNote,
          },
          { auto: true },
        );
        if (sent.ok) return "sent";
        // Blocked by quiet hours / Sunday / CNY → schedule it for the next open
        // time (drained by the outreach-scheduler cron) instead of dropping it.
        if (sent.blocked && sent.sendAfter) {
          await scheduleDeferredSend({
            agentId,
            taskId,
            channel,
            contactId: contact.id,
            subject: draft.subject,
            body: draft.body,
            sendAfter: sent.sendAfter,
            reason: sent.blocked,
          });
          return "scheduled";
        }
      }
      return "awaiting_approval";
    }

    if (task.assignee === "accountant") {
      if (!task.contact_name) return "assigned";
      // Match an open receivable by client name or invoice number.
      const needle = task.contact_name.trim();
      const { data } = await supabaseAdmin
        .from("invoices")
        .select("id, client_name, client_email, invoice_number, total, due_date, status")
        .eq("agent_id", agentId)
        .in("status", ["sent", "overdue"])
        .or(`client_name.ilike.%${needle}%,invoice_number.ilike.%${needle}%`)
        .limit(2);
      type Inv = {
        id: string;
        client_name: string | null;
        client_email: string | null;
        invoice_number: string;
        total: number;
        due_date: string | null;
        status: string;
      };
      const invoices = (data ?? []) as Inv[];
      if (invoices.length !== 1 || !invoices[0].client_email) return "assigned";
      const inv = invoices[0];

      const daysPast = inv.due_date
        ? Math.max(0, Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86_400_000))
        : 0;
      const draft = await draftMessage({
        channel: "email",
        voice: "accountant",
        agentName: await agentDisplayName(agentId),
        recipientName: inv.client_name,
        taskTitle: task.title,
        taskDetails: task.details,
        context: `Invoice ${inv.invoice_number} for $${Number(inv.total).toLocaleString()} is ${inv.status}${daysPast > 0 ? `, ${daysPast} days past due` : ""}.`,
      });
      const draftSubject = draft.subject ?? `Invoice ${inv.invoice_number}`;
      // The send path needs the recipient — invoices aren't always linked to a
      // CRM contact, so carry the email in the execution note ("to:<email>|…").
      const acctNote = `to:${inv.client_email}|invoice:${inv.invoice_number}`;
      await supabaseAdmin
        .from("boss_instruction_tasks")
        .update({
          status: "awaiting_approval",
          draft_channel: "email",
          draft_subject: draftSubject,
          draft_body: draft.body,
          execution_note: acctNote,
          updated_at: new Date().toISOString(),
        })
        .eq("id", taskId);

      if (await effectiveAutopilot(agentId, "accountant", "email")) {
        const sent = await sendDraftedBossTask(
          agentId,
          {
            id: taskId,
            title: task.title,
            assigned_to: "accountant",
            matched_contact_id: null,
            draft_channel: "email",
            draft_subject: draftSubject,
            draft_body: draft.body,
            execution_note: acctNote,
          },
          { auto: true },
        );
        if (sent.ok) return "sent";
      }
      return "awaiting_approval";
    }

    return "assigned";
  } catch (e) {
    console.error(`[boss-execution] draft failed for task ${taskId}:`, e);
    return "assigned";
  }
}

const BLOCK_LABEL: Record<SendBlockReason, string> = {
  quiet_hours: "quiet hours",
  sunday_morning: "Sunday morning",
  chinese_new_year: "the Chinese New Year pause",
};

/**
 * Queue a quiet-hours-blocked autopilot message to send at the next open time.
 * Reuses the scheduled_actions rail (drained every 15 min by the
 * outreach-scheduler cron) so we don't need a new cron, and marks the Boss task
 * `scheduled` so the card shows it's deferred (cancellable from the scheduled
 * actions strip).
 */
async function scheduleDeferredSend(args: {
  agentId: string;
  taskId: string;
  channel: "sms" | "email";
  contactId: string;
  subject: string | null;
  body: string;
  sendAfter: string;
  reason: SendBlockReason;
}): Promise<void> {
  await supabaseAdmin.from("scheduled_actions").insert({
    agent_id: args.agentId,
    channel: args.channel,
    purpose: "follow_up",
    contact_ids: [args.contactId],
    subject: args.subject,
    body: args.body,
    scheduled_for: args.sendAfter,
    status: "scheduled",
  });
  await supabaseAdmin
    .from("boss_instruction_tasks")
    .update({
      status: "scheduled",
      execution_note: `Scheduled to send after ${BLOCK_LABEL[args.reason]}.`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.taskId);
}
