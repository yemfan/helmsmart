import "server-only";

import { sendSMS } from "@/lib/twilioSms";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAssistantActivity } from "@/lib/realtorboss/activities";
import { getOpenAIConfig } from "@/lib/ai/openaiClient";
import { getSelectedSalesModelServer } from "@/lib/sales-model-server";
import { getSalesModel, DEFAULT_SALES_MODEL } from "@/lib/sales-models";

/**
 * Missed-call text-back service.
 *
 * Three responsibilities:
 *
 *   1. Read/write `missed_call_settings` for an agent (used by the
 *      settings page + the voice webhook).
 *
 *   2. Build the `<Dial>` TwiML the inbound voice webhook returns
 *      when the agent has missed-call enabled. The TwiML's `action`
 *      URL fires after the call leg ends, with `DialCallStatus`
 *      indicating whether the agent picked up.
 *
 *   3. Handle the dial-result callback: on no-answer / busy / failed,
 *      send the auto-text-back SMS to the original caller, optionally
 *      AI-personalized when the caller is a known contact, and log
 *      the row in `call_logs` with status='missed'.
 *
 * The settings table is the single source of truth — we never bake
 * defaults into the webhook handler beyond the upsert seed in
 * `getOrInitSettings`.
 */

export type MissedCallSettings = {
  agent_id: string;
  enabled: boolean;
  ring_timeout_seconds: number;
  message_template: string;
  use_ai_personalization: boolean;
  /** Master switch for the AI auto call-back ladder after a missed call. */
  callback_enabled: boolean;
  /** Minutes between call-back attempts within a day (5–240). */
  callback_interval_minutes: number;
  /** Call-back attempts placed per day (1–10). */
  callback_max_per_day: number;
  /** Days to keep attempting before opening a manual task (1–7). */
  callback_max_days: number;
  created_at: string;
  updated_at: string;
};

const DEFAULT_TEMPLATE =
  "Hey {{caller_name}} — {{agent_first_name}} here. Sorry I missed your call. What's the best way I can help? Happy to text or set up a quick call back.";

const DEFAULT_RING_TIMEOUT_SECONDS = 20;
const DEFAULT_CALLBACK_INTERVAL_MINUTES = 30;
const DEFAULT_CALLBACK_MAX_PER_DAY = 3;
const DEFAULT_CALLBACK_MAX_DAYS = 1;

const SETTINGS_COLUMNS =
  "agent_id, enabled, ring_timeout_seconds, message_template, use_ai_personalization, callback_enabled, callback_interval_minutes, callback_max_per_day, callback_max_days, created_at, updated_at";

// ── Settings ──────────────────────────────────────────────────────

/**
 * Read settings, creating a default disabled row on first read so
 * downstream code can always assume the row exists. Returns the
 * default shape on DB error rather than throwing — the voice
 * webhook should never crash on a settings lookup.
 */
export async function getOrInitSettings(
  agentId: string,
): Promise<MissedCallSettings> {
  const { data, error } = await supabaseAdmin
    .from("missed_call_settings")
    .select(SETTINGS_COLUMNS)
    .eq("agent_id", agentId)
    .maybeSingle();

  if (!error && data) return data as MissedCallSettings;

  // Seed a default row. Disabled by default — agents have to opt
  // in from settings, since the feature redirects calls.
  const seed: MissedCallSettings = {
    agent_id: agentId,
    enabled: false,
    ring_timeout_seconds: DEFAULT_RING_TIMEOUT_SECONDS,
    message_template: DEFAULT_TEMPLATE,
    use_ai_personalization: true,
    callback_enabled: true,
    callback_interval_minutes: DEFAULT_CALLBACK_INTERVAL_MINUTES,
    callback_max_per_day: DEFAULT_CALLBACK_MAX_PER_DAY,
    callback_max_days: DEFAULT_CALLBACK_MAX_DAYS,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await supabaseAdmin
    .from("missed_call_settings")
    .upsert(seed, { onConflict: "agent_id" });

  return seed;
}

export async function updateSettings(
  agentId: string,
  patch: Partial<{
    enabled: boolean;
    ring_timeout_seconds: number;
    message_template: string;
    use_ai_personalization: boolean;
    callback_enabled: boolean;
    callback_interval_minutes: number;
    callback_max_per_day: number;
    callback_max_days: number;
  }>,
): Promise<{ ok: true; settings: MissedCallSettings } | { ok: false; error: string }> {
  // Validate ring timeout if provided.
  if (
    patch.ring_timeout_seconds !== undefined &&
    (patch.ring_timeout_seconds < 5 || patch.ring_timeout_seconds > 60)
  ) {
    return {
      ok: false,
      error: "ring_timeout_seconds must be between 5 and 60.",
    };
  }
  if (
    patch.callback_interval_minutes !== undefined &&
    (patch.callback_interval_minutes < 5 || patch.callback_interval_minutes > 240)
  ) {
    return { ok: false, error: "callback_interval_minutes must be between 5 and 240." };
  }
  if (
    patch.callback_max_per_day !== undefined &&
    (patch.callback_max_per_day < 1 || patch.callback_max_per_day > 10)
  ) {
    return { ok: false, error: "callback_max_per_day must be between 1 and 10." };
  }
  if (
    patch.callback_max_days !== undefined &&
    (patch.callback_max_days < 1 || patch.callback_max_days > 7)
  ) {
    return { ok: false, error: "callback_max_days must be between 1 and 7." };
  }
  if (
    patch.message_template !== undefined &&
    !patch.message_template.trim()
  ) {
    return { ok: false, error: "message_template cannot be empty." };
  }
  if (
    patch.message_template !== undefined &&
    patch.message_template.length > 1500
  ) {
    return {
      ok: false,
      error: "message_template is too long (max 1500 chars).",
    };
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("missed_call_settings")
    .upsert(
      {
        agent_id: agentId,
        ...patch,
        updated_at: nowIso,
      },
      { onConflict: "agent_id" },
    )
    .select(SETTINGS_COLUMNS)
    .single();

  if (error) {
    console.error("[missed-call] updateSettings:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, settings: data as MissedCallSettings };
}

// ── Phone normalization ──────────────────────────────────────────

/**
 * Convert raw input to E.164 (`+1XXXXXXXXXX`) for Twilio API calls.
 * Returns null when the input doesn't look like a US 10-digit number.
 */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** Convert any phone format to `(xxx) xxx-xxxx` for contact-table lookups. */
export function toUsDisplayPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return null;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// ── Contact lookup by phone ──────────────────────────────────────

/**
 * Resolves a contact for `agentId` by an inbound caller's phone.
 * Tries `phone_number` first (canonical CRM format), then `phone`
 * (legacy column), then digits-only ilike. Returns null when none
 * of the lookups land — which means the caller is "unknown" and the
 * text-back falls back to a generic salutation.
 */
export async function findContactByPhone(
  agentId: string,
  phoneRaw: string,
): Promise<{
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  property_address: string | null;
  /** Sphere/personal relationship — not a lead. Post-call handling
   *  sends the Realtor a reminder instead of running lead capture
   *  or the AI call-back ladder. */
  personal: boolean;
} | null> {
  const usPhone = toUsDisplayPhone(phoneRaw);
  const digits = phoneRaw.replace(/\D/g, "").slice(-10);

  type Row = {
    id: string;
    name: string | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    phone_number: string | null;
    email: string | null;
    property_address: string | null;
    lifecycle_stage: string | null;
    relationship_type: string | null;
  };

  const cols =
    "id, name, first_name, last_name, phone, phone_number, email, property_address, lifecycle_stage, relationship_type";

  if (usPhone) {
    const byNumber = await supabaseAdmin
      .from("contacts")
      .select(cols)
      .eq("agent_id", agentId)
      .eq("phone_number", usPhone)
      .maybeSingle();
    if (byNumber.data) return shape(byNumber.data as Row);

    const byPhone = await supabaseAdmin
      .from("contacts")
      .select(cols)
      .eq("agent_id", agentId)
      .eq("phone", usPhone)
      .maybeSingle();
    if (byPhone.data) return shape(byPhone.data as Row);
  }

  if (digits.length === 10) {
    const byDigits = await supabaseAdmin
      .from("contacts")
      .select(cols)
      .eq("agent_id", agentId)
      .ilike("phone", `%${digits}%`)
      .limit(1);
    const first = (byDigits.data as Row[] | null)?.[0];
    if (first) return shape(first);
  }

  return null;

  function shape(r: Row) {
    return {
      id: r.id,
      name:
        r.first_name || r.last_name
          ? `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim()
          : (r.name ?? null),
      phone: r.phone_number ?? r.phone ?? null,
      email: r.email,
      property_address: r.property_address,
      personal:
        r.lifecycle_stage === "sphere" || r.relationship_type === "sphere",
    };
  }
}

// ── Agent lookup ─────────────────────────────────────────────────

export async function getAgentForwardingInfo(agentId: string): Promise<{
  forwarding_phone: string | null;
  full_name: string | null;
  user_id: string | null;
} | null> {
  // `agents` does NOT have a `full_name` column in this codebase
  // (informational schema confirms only id/auth_user_id/brand_name/
  // forwarding_phone/etc.). Selecting it errored out the entire
  // query, which made the GET /settings endpoint return
  // `forwarding_phone: null` even when the value was correctly
  // stored — and the form's "set state from response" pattern
  // promptly cleared the input on every load + save.
  //
  // Display name comes from auth.users metadata (best-effort, see
  // below); fall back to brand_name when neither is available.
  const { data } = await supabaseAdmin
    .from("agents")
    .select("forwarding_phone, auth_user_id, brand_name")
    .eq("id", agentId)
    .maybeSingle();
  if (!data) return null;
  const row = data as {
    forwarding_phone?: string | null;
    auth_user_id?: string | null;
    brand_name?: string | null;
  };

  // Best-effort name resolution from auth.users metadata. Failures
  // are swallowed — handleMissedCall already treats `full_name: null`
  // as "render with empty agent_first_name token", which the
  // template author can defend against.
  let fullName: string | null = null;
  if (row.auth_user_id) {
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(
        String(row.auth_user_id),
      );
      const meta = (userData?.user?.user_metadata ?? {}) as {
        full_name?: unknown;
        name?: unknown;
        first_name?: unknown;
        last_name?: unknown;
      };
      const fromMeta =
        (typeof meta.full_name === "string" && meta.full_name) ||
        (typeof meta.name === "string" && meta.name) ||
        ([
          typeof meta.first_name === "string" ? meta.first_name : "",
          typeof meta.last_name === "string" ? meta.last_name : "",
        ]
          .filter(Boolean)
          .join(" ")
          .trim()) ||
        null;
      fullName = fromMeta || null;
    } catch {
      // Auth admin lookup failed — leave name null.
    }
  }
  if (!fullName && row.brand_name) fullName = row.brand_name;

  return {
    forwarding_phone: row.forwarding_phone ?? null,
    full_name: fullName,
    user_id: row.auth_user_id ?? null,
  };
}

// ── Template substitution ────────────────────────────────────────

export function renderTemplate(
  template: string,
  vars: { caller_name: string; agent_first_name: string; agent_brand: string | null },
): string {
  return template
    .replace(/\{\{\s*caller_name\s*\}\}/gi, vars.caller_name)
    .replace(/\{\{\s*agent_first_name\s*\}\}/gi, vars.agent_first_name)
    .replace(/\{\{\s*agent_brand\s*\}\}/gi, vars.agent_brand ?? vars.agent_first_name)
    .trim();
}

function firstNameOf(fullName: string | null): string {
  if (!fullName) return "your agent";
  const parts = fullName.trim().split(/\s+/);
  return parts[0] || "your agent";
}

// ── AI personalization ───────────────────────────────────────────

/**
 * When AI personalization is on AND the caller is a known contact,
 * draft a tailored text-back via OpenAI in the agent's selected
 * sales-model tone. Returns null on any error so the caller falls
 * back to the template.
 */
async function aiDraftTextBack(args: {
  agentUserId: string;
  agentFirstName: string;
  contactName: string;
  contactContext: string;
}): Promise<string | null> {
  const { apiKey, model } = getOpenAIConfig();
  if (!apiKey) return null;

  const modelId = (await getSelectedSalesModelServer(args.agentUserId)) ?? DEFAULT_SALES_MODEL;
  const sm = getSalesModel(modelId);

  const systemPrompt = `You are an AI assistant helping a real-estate agent send an automatic SMS to a contact who just called and was missed.

Agent identity (${sm.name}):
- ${sm.identityTitle.replace(/^You are operating as (a |an )?/, "")}.
- Communication style: ${sm.tone}.

Rules:
- Plain text only. Max 280 characters. No emojis unless the tone explicitly calls for them${sm.id === "influencer" ? " (one is fine)" : " (avoid)"}.
- Acknowledge that the agent missed the call. Don't over-apologize.
- Address the contact by first name when supplied.
- End with one specific question or low-friction next step.
- Sign off as "— ${args.agentFirstName}" only if natural; not required.
- Do not invent facts. Use only what's in the contact context.

OUTPUT: only the SMS body. No preamble.`;

  const userPrompt = `Contact: ${args.contactName}
Context (only what we know):
${args.contactContext || "(no additional context)"}

The contact just called and the agent didn't pick up. Write the auto-SMS reply in the agent's tone.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.65,
        max_tokens: 200,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    const json = (await res.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string } }>;
    } | null;
    if (!res.ok) return null;
    const text = String(json?.choices?.[0]?.message?.content ?? "").trim();
    return text || null;
  } catch (e) {
    console.error("[missed-call] aiDraftTextBack failed:", e);
    return null;
  }
}

// ── Main entry: handle a dial-result no-answer ───────────────────

/**
 * Called from /api/twilio/voice/dial-result when the agent's leg
 * ended without picking up. Sends the auto-SMS to the original
 * caller (the inbound `From` number) and writes a `call_logs` row
 * tagged status='missed' with the linked SMS message_log id.
 */
export async function handleMissedCall(args: {
  agentId: string;
  callerPhone: string;
  twilioCallSid: string;
}): Promise<{ smsSent: boolean; logId: string | null; error?: string }> {
  const settings = await getOrInitSettings(args.agentId);
  if (!settings.enabled) {
    // Still log the missed call so the activity feed shows it — and
    // still remind the Realtor when the caller is a personal contact
    // (that's an inbox note, not an automated send).
    const contact = await findContactByPhone(args.agentId, args.callerPhone).catch(() => null);
    const logId = await logMissedCall(args, null);
    if (contact?.personal) {
      await notifyPersonalCall({
        agentId: args.agentId,
        contact,
        callerPhone: args.callerPhone,
        kind: "missed",
        smsSent: false,
      });
    }
    return { smsSent: false, logId };
  }

  const callerE164 = toE164(args.callerPhone);
  if (!callerE164) {
    await logMissedCall(args, null);
    return {
      smsSent: false,
      logId: null,
      error: "Caller phone is not a valid US number.",
    };
  }

  const agent = await getAgentForwardingInfo(args.agentId);
  const agentFirstName = firstNameOf(agent?.full_name ?? null);

  // Resolve contact (if any) for personalization + the contact_id
  // back-link on the call_logs + message_logs rows.
  const contact = await findContactByPhone(args.agentId, args.callerPhone);
  const callerName = contact?.name?.trim()
    ? contact.name.trim().split(/\s+/)[0]
    : "there";

  // Build the message body.
  let body: string | null = null;
  if (settings.use_ai_personalization && contact && agent?.user_id) {
    const ctxLines = [
      contact.phone ? `Phone: ${contact.phone}` : null,
      contact.email ? `Email: ${contact.email}` : null,
      contact.property_address
        ? `Property of interest: ${contact.property_address}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");
    body = await aiDraftTextBack({
      agentUserId: agent.user_id,
      agentFirstName,
      contactName: contact.name ?? callerName,
      contactContext: ctxLines,
    });
  }
  if (!body) {
    body = renderTemplate(settings.message_template, {
      caller_name: callerName,
      agent_first_name: agentFirstName,
      agent_brand: null,
    });
  }

  // Send via existing Twilio SMS helper. sendSMS writes a
  // message_logs row keyed by contact_id when we pass it; we do
  // when the caller is recognized.
  let textbackMessageLogId: string | null = null;
  let smsSent = false;
  try {
    const sendRes = await sendSMS(callerE164, body, contact?.id);
    textbackMessageLogId = sendRes.messageLogId;
    smsSent = true;
  } catch (e) {
    console.error("[missed-call] sendSMS failed:", e);
  }

  const logId = await logMissedCall(args, {
    contactId: contact?.id ?? null,
    textbackMessageLogId,
    smsSent,
  });

  // RealtorBoss activity feed (fire-and-forget — never fails the flow).
  void logAssistantActivity({
    agentId: args.agentId,
    assistantType: "receptionist",
    activityType: smsSent ? "missed_call_textback" : "missed_call",
    summary: smsSent
      ? `Texted back a missed call from ${contact?.name?.trim() || args.callerPhone}`
      : `Missed call from ${contact?.name?.trim() || args.callerPhone} — no text-back sent`,
    outcome: smsSent ? "Text-back sent" : "Needs follow-up",
    priority: smsSent ? "normal" : "high",
    requiresAttention: !smsSent,
    relatedEntityType: contact?.id ? "contact" : null,
    relatedEntityId: contact?.id ?? null,
  });

  // Post-miss routing: a personal (sphere) caller gets the Realtor a
  // reminder to call them back themselves; everyone else enters the
  // AI call-back ladder (+5/+10/+30 minutes until reached).
  if (contact?.personal) {
    await notifyPersonalCall({
      agentId: args.agentId,
      contact,
      callerPhone: args.callerPhone,
      kind: "missed",
      smsSent,
    });
  } else {
    const { scheduleCallBacks } = await import("@/lib/missed-call/callbacks");
    await scheduleCallBacks({
      agentId: args.agentId,
      callerPhone: args.callerPhone,
      contactId: contact?.id ?? null,
      callLogId: logId,
    });
  }

  return { smsSent, logId };
}

/**
 * Personal-call reminder: when the caller is a sphere contact, the
 * right follow-up is the Realtor reaching out personally — not lead
 * capture or an AI call-back ladder. Drops a reminder in the agent
 * inbox (bell); best-effort, never fails the voice flow.
 */
export async function notifyPersonalCall(args: {
  agentId: string;
  contact: { id: string; name: string | null };
  callerPhone: string;
  kind: "missed" | "answered";
  smsSent?: boolean;
}): Promise<void> {
  const name = args.contact.name?.trim() || args.callerPhone || "A personal contact";
  try {
    const { insertAgentInboxNotification } = await import(
      "@/lib/notifications/agentNotifications"
    );
    await insertAgentInboxNotification({
      agentId: args.agentId,
      type: "missed_call",
      priority: "medium",
      title: `Personal call from ${name}`,
      body:
        args.kind === "missed"
          ? `${name} called and didn't reach you.${args.smsSent ? " A text-back was sent." : ""} This looks personal — give them a call back when you have a minute.`
          : `${name} called and your AI Receptionist took it. This looks personal — they'd probably love to hear from you directly.`,
      deepLink: { screen: "call_log", leadId: args.contact.id },
      pushSentAt: new Date().toISOString(),
    });
    void logAssistantActivity({
      agentId: args.agentId,
      assistantType: "receptionist",
      activityType: "personal_call_reminder",
      summary: `Reminded you to call ${name} back — personal call`,
      outcome: "Reminder in your inbox",
      requiresAttention: false,
      relatedEntityType: "contact",
      relatedEntityId: args.contact.id,
    });
  } catch (e) {
    console.error("[missed-call] personal reminder failed:", e);
  }
}

async function logMissedCall(
  args: { agentId: string; callerPhone: string; twilioCallSid: string },
  meta:
    | {
        contactId: string | null;
        textbackMessageLogId: string | null;
        smsSent: boolean;
      }
    | null,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("call_logs")
    .insert({
      agent_id: args.agentId,
      contact_id: meta?.contactId ?? null,
      twilio_call_sid: args.twilioCallSid,
      direction: "inbound",
      status: "missed",
      from_phone: args.callerPhone,
      textback_message_log_id: meta?.textbackMessageLogId ?? null,
      notes: meta?.smsSent
        ? "Auto text-back sent."
        : meta === null
          ? "Missed; text-back disabled in settings."
          : "Missed; text-back send failed.",
    })
    .select("id")
    .single();
  if (error) {
    console.error("[missed-call] logMissedCall insert failed:", error.message);
    return null;
  }
  return (data as { id: string }).id;
}

// ── Outbound call logging ────────────────────────────────────────

/**
 * Record an AI outbound call in `call_logs` so it appears in the AI Assistant
 * → Inbound & outbound activity log right after it's placed. Links a known
 * contact when the dialed number matches one. The Retell `call_id` is stored in
 * `twilio_call_sid` (the row's external-call-id column) so the call-events
 * webhook can later finalize status + duration by that id.
 *
 * Best-effort: never throws — a logging failure must not fail the placed call.
 */
export async function logOutboundCall(args: {
  agentId: string;
  toPhone: string; // E.164 dialed number
  fromPhone: string; // E.164 receptionist number the call goes out from
  providerCallId: string; // Retell call_id
  leadName?: string | null;
}): Promise<{ logId: string | null; contactId: string | null }> {
  let contactId: string | null = null;
  try {
    const contact = await findContactByPhone(args.agentId, args.toPhone);
    contactId = contact?.id ?? null;
  } catch {
    // Contact match is best-effort; an unmatched number still logs.
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("call_logs")
      .insert({
        agent_id: args.agentId,
        contact_id: contactId,
        twilio_call_sid: args.providerCallId,
        direction: "outbound",
        status: "initiated",
        from_phone: args.fromPhone,
        to_phone: args.toPhone,
        notes: `AI outbound call placed${args.leadName ? ` to ${args.leadName}` : ""}.`,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[missed-call] logOutboundCall insert failed:", error.message);
      return { logId: null, contactId };
    }
    return { logId: (data as { id: string }).id, contactId };
  } catch (e) {
    console.error("[missed-call] logOutboundCall threw:", e);
    return { logId: null, contactId };
  }
}

/**
 * Record an AI INBOUND call (Retell receptionist) in `call_logs` when it starts,
 * so inbound Lucy calls appear in the same activity feed as outbound. Idempotent
 * on the provider call id (stored in `twilio_call_sid`) so a retried call_started
 * event won't double-insert. Best-effort — never throws.
 */
export async function logInboundCallStart(args: {
  agentId: string;
  fromPhone: string; // E.164 caller
  toPhone: string; // E.164 receptionist number dialed
  providerCallId: string; // Retell call_id
}): Promise<{ logId: string | null }> {
  // Skip if we already logged this call_id (e.g. duplicate webhook delivery).
  try {
    const { data: existing } = await supabaseAdmin
      .from("call_logs")
      .select("id")
      .eq("twilio_call_sid", args.providerCallId)
      .maybeSingle();
    if (existing) return { logId: (existing as { id: string }).id };
  } catch {
    // fall through to insert
  }

  let contactId: string | null = null;
  try {
    const contact = await findContactByPhone(args.agentId, args.fromPhone);
    contactId = contact?.id ?? null;
  } catch {
    // best-effort contact match
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("call_logs")
      .insert({
        agent_id: args.agentId,
        contact_id: contactId,
        twilio_call_sid: args.providerCallId,
        direction: "inbound",
        status: "in_progress",
        from_phone: args.fromPhone,
        to_phone: args.toPhone,
        notes: "AI inbound call answered by receptionist.",
      })
      .select("id")
      .single();
    if (error) {
      console.error("[missed-call] logInboundCallStart insert failed:", error.message);
      return { logId: null };
    }
    return { logId: (data as { id: string }).id };
  } catch (e) {
    console.error("[missed-call] logInboundCallStart threw:", e);
    return { logId: null };
  }
}

/**
 * Finalize a logged call (matched by the provider's call id, stored in
 * `twilio_call_sid`) once it ends — used by the Retell call-events webhook to
 * advance an outbound call from "initiated" to its real outcome with duration
 * and an optional AI summary note. Best-effort; returns false on any error.
 */
export async function finalizeCallByProviderId(args: {
  providerCallId: string;
  status: string;
  durationSeconds: number | null;
  note?: string | null;
}): Promise<boolean> {
  const patch: Record<string, unknown> = { status: args.status };
  if (args.durationSeconds != null && Number.isFinite(args.durationSeconds)) {
    patch.duration_seconds = Math.max(0, Math.round(args.durationSeconds));
  }
  if (args.note) patch.notes = args.note;

  try {
    const { error } = await supabaseAdmin
      .from("call_logs")
      .update(patch)
      .eq("twilio_call_sid", args.providerCallId);
    if (error) {
      console.error("[missed-call] finalizeCallByProviderId failed:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[missed-call] finalizeCallByProviderId threw:", e);
    return false;
  }
}

// ── Activity log read ────────────────────────────────────────────

export type CallLogEntry = {
  id: string;
  contact_id: string | null;
  contact_name: string | null;
  direction: "inbound" | "outbound";
  status: string;
  from_phone: string | null;
  to_phone: string | null;
  duration_seconds: number | null;
  textback_sent: boolean;
  /** Body of the auto-text that was sent. Null when no textback fired
   *  or the message_log has been pruned. */
  textback_message: string | null;
  /** Resend / SMS provider status of the textback ("sent",
   *  "delivered", "failed", etc.). Null when no textback fired. */
  textback_status: string | null;
  /** When the textback was logged. Null when no textback fired. */
  textback_sent_at: string | null;
  notes: string | null;
  created_at: string;
};

export async function listRecentCalls(
  agentId: string,
  limit = 50,
): Promise<CallLogEntry[]> {
  const { data, error } = await supabaseAdmin
    .from("call_logs")
    .select(
      "id, contact_id, direction, status, from_phone, to_phone, duration_seconds, textback_message_log_id, notes, created_at",
    )
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[missed-call] listRecentCalls:", error.message);
    return [];
  }

  type Row = {
    id: string;
    contact_id: string | null;
    direction: "inbound" | "outbound";
    status: string;
    from_phone: string | null;
    to_phone: string | null;
    duration_seconds: number | null;
    textback_message_log_id: string | null;
    notes: string | null;
    created_at: string;
  };

  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  // Resolve contact names in one batch query.
  const contactIds = Array.from(
    new Set(rows.map((r) => r.contact_id).filter(Boolean) as string[]),
  );
  const nameByContactId = new Map<string, string>();
  if (contactIds.length > 0) {
    const { data: contacts } = await supabaseAdmin
      .from("contacts")
      .select("id, name, first_name, last_name")
      .in("id", contactIds);
    type C = { id: string; name: string | null; first_name: string | null; last_name: string | null };
    for (const c of (contacts ?? []) as C[]) {
      const fullName =
        c.first_name || c.last_name
          ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()
          : (c.name ?? "");
      if (fullName) nameByContactId.set(c.id, fullName);
    }
  }

  // Resolve textback message bodies in one batch query so the
  // activity-first dashboard page can show what was actually sent
  // to each missed caller (not just "text was sent").
  const textbackLogIds = Array.from(
    new Set(
      rows
        .map((r) => r.textback_message_log_id)
        .filter((x): x is string => x != null),
    ),
  );
  const textbackByLogId = new Map<
    string,
    { content: string | null; status: string | null; created_at: string | null }
  >();
  if (textbackLogIds.length > 0) {
    const { data: logs } = await supabaseAdmin
      .from("message_logs")
      .select("id, content, status, created_at")
      .in("id", textbackLogIds);
    type LogRow = {
      id: string;
      content: string | null;
      status: string | null;
      created_at: string | null;
    };
    for (const l of (logs ?? []) as LogRow[]) {
      textbackByLogId.set(l.id, {
        content: l.content,
        status: l.status,
        created_at: l.created_at,
      });
    }
  }

  return rows.map((r) => {
    const tb = r.textback_message_log_id
      ? (textbackByLogId.get(r.textback_message_log_id) ?? null)
      : null;
    return {
      id: r.id,
      contact_id: r.contact_id,
      contact_name: r.contact_id ? (nameByContactId.get(r.contact_id) ?? null) : null,
      direction: r.direction,
      status: r.status,
      from_phone: r.from_phone,
      to_phone: r.to_phone,
      duration_seconds: r.duration_seconds,
      textback_sent: r.textback_message_log_id != null,
      textback_message: tb?.content ?? null,
      textback_status: tb?.status ?? null,
      textback_sent_at: tb?.created_at ?? null,
      notes: r.notes,
      created_at: r.created_at,
    };
  });
}
