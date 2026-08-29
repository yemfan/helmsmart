import "server-only";

import { sendSMS } from "@/lib/twilioSms";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getOpenAIConfig } from "@/lib/ai/openaiClient";
import { getSalesModel, type SalesModelId } from "@/lib/sales-models";

/**
 * Server helpers for the Sales-Model "Launch AI SMS" feature.
 *
 * Wire of choice:
 *   - Reads/writes ride on the existing `message_logs` table — that's
 *     already where the legacy `sendSMS()` writes outbound rows AND
 *     where the inbound Twilio webhook lands incoming replies (with
 *     contact_id resolved from phone). Filtering by `contact_id` gives
 *     us the full conversation in one query.
 *   - Drafts go through OpenAI directly (chat-completions). System
 *     prompt is tuned per the agent's sales-model identity (tone,
 *     philosophy, lead types) so the SMS feels on-brand without us
 *     re-implementing the full sms-assistant flow.
 *   - Sends go through the existing `sendSMS()` so Twilio config +
 *     `message_logs` insert stay single-sourced.
 *
 * The agent operates these in a guided loop in the modal:
 *   draft → review/edit → send → wait for inbound → auto-draft → ...
 */

export type SmsContactRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  property_address: string | null;
};

export type SmsConversationMessage = {
  id: string;
  direction: "outbound" | "inbound";
  body: string;
  created_at: string;
};

// ── Contacts search ──────────────────────────────────────────────

/**
 * Returns up to `limit` contacts that have a phone number, scoped
 * to the agent. Search is loose ilike across name + phone + email
 * so the agent can type any fragment.
 *
 * Empty `q` returns the most recently-touched contacts so the
 * picker isn't a dead dropdown the first time the modal opens.
 */
export async function searchContactsForSms(
  agentId: string,
  q: string,
  limit = 12,
): Promise<SmsContactRow[]> {
  const trimmed = q.trim();
  let query = supabaseAdmin
    .from("contacts")
    .select(
      "id, name, first_name, last_name, phone, email, property_address, last_contacted_at, created_at",
    )
    .eq("agent_id", agentId)
    .order("last_contacted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (trimmed) {
    // Escape % and , so user input can't break the OR string.
    const safe = trimmed.replace(/[%,]/g, "");
    const pattern = `%${safe}%`;
    query = query.or(
      [
        `name.ilike.${pattern}`,
        `first_name.ilike.${pattern}`,
        `last_name.ilike.${pattern}`,
        `email.ilike.${pattern}`,
        `phone.ilike.${pattern}`,
      ].join(","),
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error("[sales-model-sms] searchContactsForSms:", error.message);
    return [];
  }
  type Row = {
    id: string;
    name: string | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
    property_address: string | null;
  };
  return (data as Row[] | null)
    ?.filter((r) => Boolean(r.phone))
    .map((r) => ({
      id: r.id,
      name:
        r.first_name || r.last_name
          ? `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim()
          : (r.name ?? null),
      phone: r.phone ?? null,
      email: r.email,
      property_address: r.property_address,
    })) ?? [];
}

// ── Conversation history ─────────────────────────────────────────

/**
 * Pulls the SMS history for a contact, agent-scoped via the contact
 * row's agent_id. Returns oldest → newest so the modal can render
 * top-to-bottom without sorting in the client.
 *
 * Reads from `message_logs` because that's the table the legacy
 * `sendSMS()` writes outbound rows to AND where the inbound webhook
 * resolves and inserts replies. Single source for both directions.
 */
export async function loadSmsConversation(
  agentId: string,
  contactId: string,
  limit = 50,
): Promise<{ messages: SmsConversationMessage[]; contact: SmsContactRow | null }> {
  // Ownership check + grab phone for outbound use.
  const { data: contactRow } = await supabaseAdmin
    .from("contacts")
    .select(
      "id, name, first_name, last_name, phone, email, property_address, agent_id",
    )
    .eq("id", contactId)
    .eq("agent_id", agentId)
    .maybeSingle();

  if (!contactRow) {
    return { messages: [], contact: null };
  }

  const c = contactRow as {
    id: string;
    name: string | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
    property_address: string | null;
  };

  const contact: SmsContactRow = {
    id: c.id,
    name:
      c.first_name || c.last_name
        ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()
        : (c.name ?? null),
    phone: c.phone ?? null,
    email: c.email,
    property_address: c.property_address,
  };

  const { data: rows, error } = await supabaseAdmin
    .from("message_logs")
    .select("id, type, status, content, created_at")
    .eq("contact_id", contactId)
    .eq("type", "sms")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[sales-model-sms] loadSmsConversation:", error.message);
    return { messages: [], contact };
  }

  type LogRow = {
    id: string;
    type: string;
    status: string;
    content: string | null;
    created_at: string;
  };

  const messages: SmsConversationMessage[] = (rows as LogRow[] | null ?? [])
    .map((r) => {
      // The webhook stores incoming replies with status "received";
      // outbound rows from sendSMS use "sent". Anything else (e.g.
      // legacy "replied") we treat as inbound to be safe — the
      // visual "from us" / "from them" is the only thing that
      // matters here.
      const direction: "inbound" | "outbound" =
        r.status === "sent" ? "outbound" : "inbound";
      return {
        id: r.id,
        direction,
        body: r.content ?? "",
        created_at: r.created_at,
      };
    })
    .filter((m) => m.body.length > 0);

  return { messages, contact };
}

// ── Draft (model-aware) ──────────────────────────────────────────

/**
 * Generates a draft outbound SMS for the agent. Two modes:
 *
 *   - **Initial outreach** — no prior messages. Uses the agent's
 *     situation briefing + contact context to draft an opening
 *     message in the sales-model tone.
 *
 *   - **Reply draft** — has prior messages. Uses the situation as
 *     backdrop + the full conversation history (especially the
 *     latest inbound message) to draft the agent's next reply,
 *     still in the sales-model tone.
 *
 * Returns plain text suitable to drop into the compose box. SMS-
 * specific constraints (length, no markdown, friendly URL handling)
 * are baked into the system prompt.
 */
export async function draftSmsMessage(args: {
  modelId: SalesModelId;
  situation: string;
  contact: SmsContactRow;
  conversation: SmsConversationMessage[];
}): Promise<{ ok: true; draft: string } | { ok: false; code: string; error: string }> {
  const { modelId, situation, contact, conversation } = args;
  const model = getSalesModel(modelId);
  const { apiKey, model: openaiModel } = getOpenAIConfig();

  if (!apiKey) {
    return {
      ok: false,
      code: "ai_unconfigured",
      error: "AI is not configured on this environment.",
    };
  }

  const isReply = conversation.length > 0;

  const contactBlock = [
    contact.name ? `Name: ${contact.name}` : "Name: (unknown)",
    contact.email ? `Email: ${contact.email}` : null,
    contact.property_address ? `Property of interest: ${contact.property_address}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const transcript = conversation
    .slice(-12)
    .map((m) => `${m.direction === "inbound" ? "Lead" : "Agent"}: ${m.body}`)
    .join("\n");

  const systemPrompt = `You are an AI assistant helping a real-estate agent text a contact via SMS.

Agent identity (${model.name}):
- ${model.identityTitle.replace(/^You are operating as (a |an )?/, "")}.
- Communication style: ${model.tone}.
- Philosophy: ${model.philosophy}

SMS-specific rules — these are non-negotiable:
- Plain text only. No markdown, no emojis unless the tone calls for them${model.id === "influencer" ? " (one or two are fine)" : " (avoid)"}.
- Length: 1–3 sentences, max ~320 characters. Real SMS, not email.
- No "[brackets]" placeholders. No fake details. If the agent's situation is missing a fact, write the sentence around it.
- Do not sign off with the agent's name unless their name is in the situation.
- One clear ask per message — a single question, not three.
- Match the tone EXACTLY. ${model.id === "influencer" ? "Don't go corporate." : model.id === "closer" ? "Don't get fluffy." : model.id === "advisor" ? "Don't get pushy." : "Default to clean professional voice."}

OUTPUT: only the SMS body. No preamble like "Here's the message:". The agent will paste it directly.`;

  const userPrompt = isReply
    ? `Situation context (provided by the agent before this conversation started):
${situation || "(none)"}

Contact:
${contactBlock}

Conversation so far (most recent at the bottom):
${transcript}

Write the agent's NEXT outbound SMS to this contact. Respond directly to the lead's most recent message above, while staying aligned with the situation context and the agent's tone.`
    : `Situation (what the agent wants this SMS to accomplish):
${situation || "(no situation provided — write a friendly opening that invites a brief reply)"}

Contact:
${contactBlock}

Write the FIRST outbound SMS the agent should send to this contact. Open the conversation in the agent's tone, reference the situation specifically, and end with one low-friction question.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: openaiModel,
        // Slightly higher temp than reply-generator (0.55) but lower
        // than the long-form Script Generator (0.7) — SMS is
        // formula-heavy enough that we want consistency without
        // robotic repetition across regenerations.
        temperature: 0.65,
        max_tokens: 220,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    const json = (await res.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    } | null;

    if (!res.ok) {
      const upstreamMsg = json?.error?.message ?? `OpenAI ${res.status}`;
      console.error("[sales-model-sms] OpenAI error:", res.status, upstreamMsg);
      return { ok: false, code: "openai_error", error: "AI service error. Try again." };
    }
    const text = String(json?.choices?.[0]?.message?.content ?? "").trim();
    if (!text) {
      return { ok: false, code: "empty_response", error: "AI returned an empty response." };
    }
    return { ok: true, draft: text };
  } catch (e) {
    console.error("[sales-model-sms] fetch failed:", e);
    return { ok: false, code: "openai_unreachable", error: "Could not reach AI service." };
  }
}

// ── Send ─────────────────────────────────────────────────────────

/**
 * Sends an outbound SMS to the contact + writes a `message_logs`
 * row tagged status="sent" so it appears in the next conversation
 * poll. Validates the contact belongs to the agent before doing
 * anything Twilio-shaped.
 *
 * `sendSMS()` itself writes the message_logs row when we pass the
 * contact id as `leadId` — that param actually maps to `contact_id`
 * inside the helper. We rely on that for single-source logging.
 */
export async function sendSmsForAgent(args: {
  agentId: string;
  contactId: string;
  message: string;
}): Promise<
  | { ok: true; sid: string; messageLogId: string | null }
  | { ok: false; code: string; error: string; status?: number }
> {
  const { agentId, contactId, message } = args;

  const trimmed = message.trim();
  if (!trimmed) {
    return { ok: false, code: "empty_message", error: "Message is empty.", status: 400 };
  }
  if (trimmed.length > 1500) {
    // Twilio segments at 160 chars but accepts long bodies. We cap
    // to keep accidental paste-bombs from racking up segments.
    return {
      ok: false,
      code: "message_too_long",
      error: "Message is too long (max 1500 chars).",
      status: 400,
    };
  }

  const { data: contactRow } = await supabaseAdmin
    .from("contacts")
    .select("id, phone, agent_id")
    .eq("id", contactId)
    .eq("agent_id", agentId)
    .maybeSingle();

  if (!contactRow) {
    return {
      ok: false,
      code: "contact_not_found",
      error: "Contact not found.",
      status: 404,
    };
  }
  const phone = (contactRow as { phone?: string | null }).phone || "";
  if (!phone) {
    return {
      ok: false,
      code: "no_phone",
      error: "This contact has no phone number on file.",
      status: 400,
    };
  }

  try {
    const result = await sendSMS(phone, trimmed, contactId);
    return { ok: true, sid: result.sid, messageLogId: result.messageLogId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Twilio send failed";
    console.error("[sales-model-sms] sendSMS threw:", msg);
    // Surface the not-configured case with a distinct code so the
    // client can show a clear "Twilio isn't set up" message rather
    // than a generic 500.
    if (/Twilio SMS is not configured/i.test(msg)) {
      return { ok: false, code: "twilio_unconfigured", error: msg, status: 503 };
    }
    return { ok: false, code: "twilio_error", error: msg, status: 502 };
  }
}
