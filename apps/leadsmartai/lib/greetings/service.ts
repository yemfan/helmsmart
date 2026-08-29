import OpenAI from "openai";
import { buildGreetingGeneratorSystemInstructions } from "@/lib/agent-ai/promptBuilder";
import {
  DEFAULT_AGENT_AI_SETTINGS,
  getAgentAiSettingsWithMeta,
  resolveGreetingTone,
} from "@/lib/agent-ai/settings";
import type { AgentAiSettings } from "@/lib/agent-ai/types";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendOutboundSms } from "@/lib/ai-sms/outbound";
import { sendOutboundEmail } from "@/lib/ai-email/send";
import { chooseGreetingChannel, canSendGreeting } from "./compliance";
import { detectCheckinEvent, detectGreetingEvents, sortEventsByPriority } from "./events";
import { buildGreetingPrompt } from "./prompts";
import type {
  GeneratedGreeting,
  GreetingAutomationSettings,
  GreetingChannel,
  GreetingEvent,
  GreetingEventType,
  GreetingLead,
} from "./types";

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

function greetingModel() {
  return (
    process.env.OPENAI_GREETING_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o-mini"
  );
}

function parseTagsJson(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

function mapLeadRow(row: Record<string, unknown>): GreetingLead {
  const phone = String((row.phone as string) || "").trim() || null;
  return {
    id: String(row.id),
    assignedAgentId: row.agent_id != null ? String(row.agent_id) : null,
    name: (row.name as string) ?? null,
    email: (row.email as string) ?? null,
    phone,
    address: (row.property_address as string) ?? null,
    city: (row.city as string) ?? null,
    state: (row.state as string) ?? null,
    birthday: row.birthday ? String(row.birthday).slice(0, 10) : null,
    homePurchaseDate: row.home_purchase_date ? String(row.home_purchase_date).slice(0, 10) : null,
    preferredContactChannel: (row.preferred_contact_channel as string) ?? null,
    relationshipStage: (row.relationship_stage as string) ?? null,
    contactOptOutSms: Boolean(row.contact_opt_out_sms),
    contactOptOutEmail: Boolean(row.contact_opt_out_email),
    smsOptIn: typeof row.sms_opt_in === "boolean" ? row.sms_opt_in : undefined,
    lastContactedAt: (row.last_contacted_at as string) ?? null,
    leadTemperature: (row.rating as string) ?? null,
    leadTags: parseTagsJson(row.lead_tags_json),
  };
}

const leadSelect = [
  "id",
  "agent_id",
  "name",
  "email",
  "phone",
  "phone",
  "property_address",
  "city",
  "state",
  "birthday",
  "home_purchase_date",
  "preferred_contact_channel",
  "relationship_stage",
  "contact_opt_out_sms",
  "contact_opt_out_email",
  "sms_opt_in",
  "last_contacted_at",
  "rating",
  "lead_tags_json",
].join(",");

export async function fetchGreetingLeadById(leadId: string): Promise<GreetingLead | null> {
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select(leadSelect)
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapLeadRow(data as unknown as Record<string, unknown>);
}

export async function getGreetingSettings(agentId: string): Promise<GreetingAutomationSettings> {
  const { data, error } = await supabaseAdmin
    .from("greeting_automation_settings")
    .select("*")
    .eq("agent_id", agentId as any)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return {
      agentId,
      birthdayEnabled: true,
      holidayEnabled: true,
      homeAnniversaryEnabled: true,
      checkinEnabled: false,
      preferredChannel: "smart",
      tone: "friendly",
      sendHourLocal: 9,
      useAiPersonalization: true,
    };
  }

  const r = data as Record<string, unknown>;
  return {
    agentId,
    birthdayEnabled: Boolean(r.birthday_enabled),
    holidayEnabled: Boolean(r.holiday_enabled),
    homeAnniversaryEnabled: Boolean(r.home_anniversary_enabled),
    checkinEnabled: Boolean(r.checkin_enabled),
    preferredChannel: (r.preferred_channel as GreetingAutomationSettings["preferredChannel"]) || "smart",
    tone: (r.tone as GreetingAutomationSettings["tone"]) || "friendly",
    sendHourLocal: Number(r.send_hour_local ?? 9),
    useAiPersonalization: r.use_ai_personalization !== false,
  };
}

export async function listEligibleGreetingLeads(agentId?: string) {
  let q = supabaseAdmin.from("contacts").select(leadSelect).not("agent_id", "is", null).limit(2000);
  if (agentId) q = q.eq("agent_id", agentId as any);

  const { data, error } = await q;
  if (error) throw error;

  return (data || []).map((row) => mapLeadRow(row as unknown as Record<string, unknown>));
}

async function alreadySentGreeting(leadId: string, event: GreetingEvent, today: Date): Promise<boolean> {
  if (event.type === "checkin") {
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const { data } = await supabaseAdmin
      .from("greeting_message_history")
      .select("id")
      .eq("contact_id", leadId)
      .eq("event_type", "checkin")
      .eq("status", "sent")
      .gte("created_at", start.toISOString())
      .limit(1)
      .maybeSingle();
    return Boolean(data?.id);
  }

  const dayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  let query = supabaseAdmin
    .from("greeting_message_history")
    .select("id")
    .eq("contact_id", leadId)
    .eq("event_type", event.type)
    .eq("status", "sent")
    .gte("created_at", dayStart.toISOString())
    .lt("created_at", dayEnd.toISOString());

  if (event.type === "holiday" && event.holidayKey) {
    query = query.eq("holiday_key", event.holidayKey);
  }

  const { data } = await query.limit(1).maybeSingle();
  return Boolean(data?.id);
}

function eventEnabled(event: GreetingEvent, settings: GreetingAutomationSettings) {
  if (event.type === "birthday" && !settings.birthdayEnabled) return false;
  if (event.type === "holiday" && !settings.holidayEnabled) return false;
  if (event.type === "home_anniversary" && !settings.homeAnniversaryEnabled) return false;
  if (event.type === "checkin" && !settings.checkinEnabled) return false;
  return true;
}

export async function generateGreeting(params: {
  lead: GreetingLead;
  event: GreetingEvent;
  settings: GreetingAutomationSettings;
  channel: GreetingChannel;
}): Promise<GeneratedGreeting> {
  const { lead, event, settings, channel } = params;

  if (!settings.useAiPersonalization) {
    const body =
      event.type === "birthday"
        ? `Happy Birthday${lead.name ? `, ${lead.name}` : ""}! Wishing you a wonderful day and a great year ahead.`
        : event.type === "home_anniversary"
          ? `Hope you're still loving your home${lead.address ? ` at ${lead.address}` : ""}! Just wanted to say happy home anniversary.`
          : event.type === "checkin"
            ? `Hi${lead.name ? ` ${lead.name}` : ""}, just checking in — hope you're doing well. If you ever need anything real estate–related, I'm here.`
            : event.holidayKey === "chinese_new_year"
              ? `新年快乐${lead.name ? `，${lead.name}` : ""}！祝您及家人身体健康、万事如意。Wishing you and your family a happy, healthy, and prosperous Lunar New Year!`
              : `Wishing you warm holiday greetings${lead.name ? `, ${lead.name}` : ""}!`;

    return {
      eventType: event.type,
      channel,
      subject: channel === "email" ? "A quick hello from LeadSmart AI" : "",
      body,
      tags: [event.type, "template"],
    };
  }

  const openai = getOpenAI();
  if (!openai) {
    return generateGreeting({ ...params, settings: { ...settings, useAiPersonalization: false } });
  }

  const { settings: agentAi, hasRow } = await getAgentAiSettingsWithMeta(lead.assignedAgentId ?? undefined);
  const effectiveTone = resolveGreetingTone({
    agentAi,
    greetingAutomationTone: settings.tone,
    hasAgentAiRow: hasRow,
  });

  const mergedAgentAi: AgentAiSettings = hasRow
    ? agentAi
    : { ...DEFAULT_AGENT_AI_SETTINGS, personality: effectiveTone };

  const userPrompt = buildGreetingPrompt({
    eventType: event.type,
    holidayKey: event.holidayKey,
    leadName: lead.name,
    propertyAddress: lead.address,
    city: lead.city,
    tone: effectiveTone,
    channel,
    relationshipStage: lead.relationshipStage,
    lastContactedAt: lead.lastContactedAt,
  });

  const instructions = buildGreetingGeneratorSystemInstructions(mergedAgentAi);

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      subject: { type: "string" },
      body: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["subject", "body", "tags"],
  } as const;

  try {
    const response = await openai.responses.create({
      model: greetingModel(),
      instructions,
      input: [{ role: "user", content: userPrompt }],
      text: {
        format: {
          type: "json_schema",
          name: "greeting_message",
          strict: true,
          schema: schema as unknown as Record<string, unknown>,
        },
      },
    });

    const outputText = response.output_text?.trim();
    if (!outputText) throw new Error("empty output");
    const parsed = JSON.parse(outputText) as { subject: string; body: string; tags: string[] };
    return {
      eventType: event.type,
      channel,
      subject: channel === "email" ? parsed.subject || "Thinking of you" : "",
      body: parsed.body,
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    };
  } catch {
    return generateGreeting({ ...params, settings: { ...settings, useAiPersonalization: false } });
  }
}

export async function recordGreetingHistory(params: {
  leadId: string;
  agentId?: string | null;
  eventType: GreetingEventType;
  holidayKey?: string | null;
  channel: GreetingChannel;
  subject?: string | null;
  body: string;
  status: "queued" | "sent" | "failed" | "skipped";
  skippedReason?: string | null;
  metadata?: Record<string, unknown>;
  sentAt?: string | null;
}) {
  const { error } = await supabaseAdmin.from("greeting_message_history").insert({
    contact_id: params.leadId,
    agent_id: params.agentId ?? null,
    event_type: params.eventType,
    holiday_key: params.holidayKey ?? null,
    channel: params.channel,
    subject: params.subject ?? null,
    body: params.body,
    status: params.status,
    skipped_reason: params.skippedReason ?? null,
    metadata_json: params.metadata ?? {},
    sent_at: params.sentAt ?? null,
  } as Record<string, unknown>);

  if (error) throw error;
}

export async function sendGreeting(params: { lead: GreetingLead; generated: GeneratedGreeting }) {
  const { lead, generated } = params;

  if (generated.channel === "sms") {
    const to = (lead.phone || "").trim();
    if (!to) throw new Error("missing_phone");
    await sendOutboundSms({
      leadId: lead.id,
      to,
      body: generated.body,
      agentId: lead.assignedAgentId ?? null,
      actorType: "system",
      actorName: "LeadSmart AI Greetings",
    });
  } else {
    const to = (lead.email || "").trim();
    if (!to) throw new Error("missing_email");
    await sendOutboundEmail({
      leadId: lead.id,
      to,
      subject: generated.subject || "Thinking of you",
      body: generated.body,
      agentId: lead.assignedAgentId ?? null,
      actorType: "system",
      actorName: "LeadSmart AI Greetings",
      deliver: true,
    });
  }
}

export async function runGreetingAutomation(agentId?: string, todayInput?: Date) {
  const today = todayInput ?? new Date();
  const leads = await listEligibleGreetingLeads(agentId);
  const settingsCache = new Map<string, GreetingAutomationSettings>();
  const results: Array<{ leadId: string; eventType: string; status: string; reason?: string }> = [];

  for (const lead of leads) {
    const resolvedAgentId = lead.assignedAgentId;
    if (!resolvedAgentId) continue;

    if (!settingsCache.has(resolvedAgentId)) {
      settingsCache.set(resolvedAgentId, await getGreetingSettings(resolvedAgentId));
    }
    const settings = settingsCache.get(resolvedAgentId)!;

    const rawEvents = [...detectGreetingEvents(lead, today)];
    if (settings.checkinEnabled) {
      const checkin = detectCheckinEvent(lead, today);
      if (checkin) rawEvents.push(checkin);
    }

    const enabled = rawEvents.filter((e) => eventEnabled(e, settings));
    const sorted = sortEventsByPriority(enabled);
    const event = sorted[0];
    if (!event) continue;

    if (await alreadySentGreeting(lead.id, event, today)) {
      results.push({ leadId: lead.id, eventType: event.type, status: "skipped", reason: "already_sent" });
      continue;
    }

    const channel = chooseGreetingChannel(lead, settings.preferredChannel);
    const compliance = canSendGreeting(lead, channel);

    if (!compliance.allowed) {
      await recordGreetingHistory({
        leadId: lead.id,
        agentId: resolvedAgentId,
        eventType: event.type,
        holidayKey: event.holidayKey ?? null,
        channel,
        body: "(skipped)",
        status: "skipped",
        skippedReason: compliance.reason,
        metadata: { event },
      });
      results.push({
        leadId: lead.id,
        eventType: event.type,
        status: "skipped",
        reason: compliance.reason || undefined,
      });
      continue;
    }

    try {
      const generated = await generateGreeting({ lead, event, settings, channel });
      await sendGreeting({ lead, generated });
      const sentAt = new Date().toISOString();
      await recordGreetingHistory({
        leadId: lead.id,
        agentId: resolvedAgentId,
        eventType: event.type,
        holidayKey: event.holidayKey ?? null,
        channel,
        subject: generated.subject || null,
        body: generated.body,
        status: "sent",
        sentAt,
        metadata: { tags: generated.tags },
      });

      try {
        await supabaseAdmin.rpc("log_lead_event", {
          p_contact_id: lead.id,
          p_event_type: "greeting_sent",
          p_metadata: {
            eventType: event.type,
            channel,
            holidayKey: event.holidayKey ?? null,
            tags: generated.tags,
            source: "greeting_automation",
          },
        });
      } catch {
        // optional
      }

      results.push({ leadId: lead.id, eventType: event.type, status: "sent" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "send_failed";
      await recordGreetingHistory({
        leadId: lead.id,
        agentId: resolvedAgentId,
        eventType: event.type,
        holidayKey: event.holidayKey ?? null,
        channel,
        body: "(failed)",
        status: "failed",
        skippedReason: msg,
        metadata: { event },
      });
      results.push({ leadId: lead.id, eventType: event.type, status: "failed", reason: msg });
    }
  }

  return results;
}
