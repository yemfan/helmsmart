import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAnthropicClient } from "@/lib/anthropic";
import { BOSS_AGENT_MODEL } from "@/lib/ai/config";

/**
 * Title prefix for the briefing's inactive-lead task.
 *
 * Load-bearing, and in more places than you would guess: `markContactActivity`
 * closes these by ILIKE on this prefix the moment the lead replies, and the
 * briefing's own dedup keys off it so a task isn't recreated nightly. Changing
 * the wording in one place and not the others silently strands every open task —
 * so the string lives here and everyone imports it.
 */
export const INACTIVE_FOLLOWUP_PREFIX = "Follow up with inactive lead:";

/**
 * Have the Sales assistant draft the text, rather than telling the realtor to
 * write one.
 *
 * The briefing used to emit a bare reminder — "Follow up with inactive lead:
 * David Kim" — which is a note to self, not work done. It restates a problem the
 * agent already knew about and leaves the whole job in their hands, so the pile
 * grows: five of these were sitting weeks overdue.
 *
 * Now Chris writes the message and parks it in the approval queue. The agent's
 * job shrinks to reading it and pressing approve, and the draft carries the one
 * thing a reminder never does — the actual words.
 *
 * Returns the draft id, or null. Always best-effort: a briefing that could not
 * reach the model must still produce its task, because a task without a draft is
 * exactly what we had before, and a briefing that throws is worse than both.
 */
export async function draftInactiveLeadNudge(input: {
  agentId: string;
  contactId: string;
  contactName: string | null;
  daysInactive: number;
  address?: string | null;
}): Promise<string | null> {
  try {
    // No phone, no text worth drafting — the call task still stands on its own.
    const { data: contactRow } = await supabaseAdmin
      .from("contacts")
      .select("first_name, name, phone, phone_number, notes, preferred_language")
      .eq("id", input.contactId as never)
      .eq("agent_id", input.agentId as never)
      .maybeSingle();
    const c = contactRow as {
      first_name?: string | null;
      name?: string | null;
      phone?: string | null;
      phone_number?: string | null;
      notes?: string | null;
      preferred_language?: string | null;
    } | null;
    if (!c) return null;
    if (!c.phone && !c.phone_number) return null;

    const { data: agentRow } = await supabaseAdmin
      .from("agents")
      .select("brand_name")
      .eq("id", input.agentId as never)
      .maybeSingle();
    const brand = (agentRow as { brand_name?: string | null } | null)?.brand_name ?? null;

    const recipient = c.first_name?.trim() || c.name?.trim() || input.contactName?.trim() || null;
    const zh = (c.preferred_language ?? "").toLowerCase().startsWith("zh");

    const system = `You draft outbound messages for a real estate professional's AI team. Write in FIRST PERSON as the Realtor${brand ? ` (${brand})` : ""} — warm, professional, concise, never pushy.

Rules:
- SMS: max 300 characters, plain text, no subject, 0-1 emoji.
- ${zh ? "Write in Simplified Chinese — this contact's preferred language." : "Write in English."}
- Use ONLY the facts provided. Never invent prices, dates, addresses, or amounts.
- This person has gone quiet. Re-open the conversation; do not guilt them about the silence or ask "are you still interested?".
- Give them one easy thing to reply to.
- Address them by first name when known.

Output ONLY a JSON object: { "body": "string" }`;

    const facts = [
      recipient ? `Recipient: ${recipient}` : null,
      input.daysInactive < 999
        ? `They have not been in contact for ${input.daysInactive} days.`
        : `They have never been contacted.`,
      input.address ? `Property of interest: ${input.address}` : null,
      c.notes ? `What we know about them: ${c.notes.slice(0, 400)}` : null,
      "",
      "Write the message now. Return only the JSON object.",
    ]
      .filter((l) => l !== null)
      .join("\n");

    const response = await getAnthropicClient().messages.create({
      model: BOSS_AGENT_MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: facts }],
    });
    const tb = response.content.find((b) => b.type === "text");
    if (!tb || tb.type !== "text") return null;
    const text = tb.text.replace(/```(?:json)?|```/g, "");
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first < 0 || last <= first) return null;

    let body = "";
    try {
      const raw = JSON.parse(text.slice(first, last + 1)) as { body?: unknown };
      body = typeof raw.body === "string" ? raw.body.trim() : "";
    } catch {
      return null;
    }
    if (!body) return null;

    const { data: draft, error } = await supabaseAdmin
      .from("message_drafts")
      .insert({
        agent_id: input.agentId,
        contact_id: input.contactId,
        channel: "sms",
        body: body.slice(0, 320),
        status: "pending",
        trigger_context: {
          source: "briefing_inactive_lead",
          assignee: "sales_assistant",
          days_inactive: input.daysInactive,
        },
      })
      .select("id")
      .single();
    if (error || !draft) {
      console.error("[inactive-nudge] draft insert failed:", error?.message);
      return null;
    }
    return String((draft as { id: unknown }).id);
  } catch (e) {
    console.error("[inactive-nudge] draft failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Is there already a pending nudge for this contact?
 *
 * The briefing runs daily; without this, a lead who stays quiet for a fortnight
 * accumulates fourteen drafts in the approval queue, which turns the queue into
 * the same backlog the reminders were.
 */
export async function hasPendingNudge(agentId: string, contactId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from("message_drafts")
      .select("id")
      .eq("agent_id", agentId as never)
      .eq("contact_id", contactId as never)
      .eq("status", "pending")
      .limit(1);
    return ((data ?? []) as unknown[]).length > 0;
  } catch {
    // Assume one exists: a duplicate draft is worse than a missing one, since
    // the task is created either way and the agent still sees the lead.
    return true;
  }
}
