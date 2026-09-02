import { sendOutboundEmail } from "@/lib/ai-email/send";
import { sendOutboundSms } from "@/lib/ai-sms/outbound";
import {
  generateEmailReplyDraft,
  generateReply,
  type GenerateReplyContext,
  type ReplyMessage,
} from "@/lib/aiReplyGenerator";
import { fetchRecentEmailForLead, fetchRecentSmsForLead } from "@/lib/mobile/conversations";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { MobileEmailMessageDto, MobileSmsMessageDto } from "@leadsmart/shared";
import { OWN_MESSAGES_FILTER } from "@/lib/email/ownMessages";

const LEAD_REPLY_SELECT =
  "id,agent_id,name,email,phone,property_address,search_location,price_min,price_max,intent,rating,source,lead_status";

function leadPhone(row: Record<string, unknown>): string | null {
  const p = String(row.phone || "").trim();
  return p || null;
}

function leadEmail(row: Record<string, unknown>): string | null {
  const e = String(row.email || "").trim();
  return e || null;
}

async function loadLeadForAgent(agentId: string, leadId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select(LEAD_REPLY_SELECT)
    .eq("id", leadId)
    .eq("agent_id", agentId as never)
    .is("merged_into_lead_id", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? (data as Record<string, unknown>) : null;
}

function toReplyContext(lead: Record<string, unknown>): GenerateReplyContext["lead"] {
  return {
    name: lead.name != null ? String(lead.name) : null,
    property_address: lead.property_address != null ? String(lead.property_address) : null,
    search_location: lead.search_location != null ? String(lead.search_location) : null,
    price_min: lead.price_min != null ? Number(lead.price_min) : null,
    price_max: lead.price_max != null ? Number(lead.price_max) : null,
    intent: lead.intent != null ? String(lead.intent) : null,
    rating: lead.rating != null ? String(lead.rating) : null,
    source: lead.source != null ? String(lead.source) : null,
    lead_status: lead.lead_status != null ? String(lead.lead_status) : null,
  };
}

function smsRowsToReplyMessages(rows: MobileSmsMessageDto[]): ReplyMessage[] {
  return rows.map((m) => ({
    role: m.direction === "inbound" ? "user" : "assistant",
    content: m.message || "—",
    created_at: m.created_at,
  }));
}

function emailRowsToReplyMessages(rows: MobileEmailMessageDto[]): ReplyMessage[] {
  return rows.map((m) => {
    const sub = m.subject?.trim();
    const body = m.message || "—";
    const content = sub ? `[Subject: ${sub}]\n${body}` : body;
    return {
      role: m.direction === "inbound" ? "user" : "assistant",
      content,
      created_at: m.created_at,
    };
  });
}

async function fetchLatestOutboundSms(leadId: string): Promise<MobileSmsMessageDto> {
  const { data, error } = await supabaseAdmin
    .from("sms_messages")
    .select("id,message,direction,created_at")
    .eq("contact_id", leadId)
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("SMS persisted but could not be loaded.");
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    message: String(row.message ?? ""),
    direction: "outbound",
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

async function fetchLatestOutboundEmail(leadId: string): Promise<MobileEmailMessageDto> {
  const { data, error } = await supabaseAdmin
    .from("email_messages")
    .select("id,subject,message,direction,created_at")
    .eq("contact_id", leadId)
    .eq("direction", "outbound")
    .or(OWN_MESSAGES_FILTER)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Email persisted but could not be loaded.");
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    subject: row.subject != null ? String(row.subject) : null,
    message: String(row.message ?? ""),
    direction: "outbound",
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

export async function mobileSendSmsReply(params: {
  agentId: string;
  leadId: string;
  body: string;
}): Promise<MobileSmsMessageDto> {
  const text = params.body.trim();
  if (!text) throw new Error("Message body is required.");
  if (text.length > 1600) throw new Error("SMS is too long.");

  const lead = await loadLeadForAgent(params.agentId, params.leadId);
  if (!lead) throw new Error("NOT_FOUND");

  const to = leadPhone(lead);
  if (!to) throw new Error("Lead has no phone number.");

  await sendOutboundSms({
    leadId: params.leadId,
    to,
    body: text,
    agentId: params.agentId,
    actorType: "agent",
    actorName: "LeadSmart AI Mobile",
  });

  return fetchLatestOutboundSms(params.leadId);
}

export async function mobileSendEmailReply(params: {
  agentId: string;
  leadId: string;
  subject: string;
  body: string;
}): Promise<MobileEmailMessageDto> {
  const subject = params.subject.trim();
  const body = params.body.trim();
  if (!subject) throw new Error("Subject is required.");
  if (!body) throw new Error("Message body is required.");

  const lead = await loadLeadForAgent(params.agentId, params.leadId);
  if (!lead) throw new Error("NOT_FOUND");

  const to = leadEmail(lead);
  if (!to) throw new Error("Lead has no email address.");

  await sendOutboundEmail({
    leadId: params.leadId,
    to,
    subject,
    body,
    agentId: params.agentId,
    actorType: "agent",
    actorName: "LeadSmart AI Mobile",
  });

  return fetchLatestOutboundEmail(params.leadId);
}

export async function mobileDraftSmsAiReply(agentId: string, leadId: string): Promise<string> {
  const lead = await loadLeadForAgent(agentId, leadId);
  if (!lead) throw new Error("NOT_FOUND");

  const sms = await fetchRecentSmsForLead(leadId);
  const ctx: GenerateReplyContext = {
    lead: toReplyContext(lead),
    messages: smsRowsToReplyMessages(sms),
    task: "Draft a concise SMS the agent can send as a reply. Aim under 160 characters when possible (hard max ~320). Practical, warm, one clear question at most. No markdown.",
  };

  const text = await generateReply(ctx);
  return text.trim();
}

export async function mobileDraftEmailAiReply(
  agentId: string,
  leadId: string
): Promise<{ subject: string; body: string }> {
  const lead = await loadLeadForAgent(agentId, leadId);
  if (!lead) throw new Error("NOT_FOUND");

  const emails = await fetchRecentEmailForLead(leadId);
  const ctx: GenerateReplyContext = {
    lead: toReplyContext(lead),
    messages: emailRowsToReplyMessages(emails),
  };

  return generateEmailReplyDraft(ctx);
}
