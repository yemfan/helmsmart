import { supabaseAdmin } from "@/lib/supabase/admin";
import type { EmailAssistantReply, EmailLeadSnapshot } from "./types";

const leadSelect =
  "id,name,email,phone,lead_status,status,nurture_score,rating,property_address,city,state,intent,agent_id";

export function emailLeadRowToSnapshot(data: Record<string, unknown>): EmailLeadSnapshot {
  return {
    leadId: data.id != null ? String(data.id) : null,
    name: (data.name as string) ?? null,
    email: (data.email as string) ?? null,
    phone: (data.phone as string) || null,
    status: ((data.lead_status as string) ?? (data.status as string)) || null,
    leadScore: typeof data.nurture_score === "number" ? data.nurture_score : null,
    leadTemperature: (data.rating as string) ?? null,
    propertyAddress: (data.property_address as string) ?? null,
    city: (data.city as string) ?? null,
    state: (data.state as string) ?? null,
    intent: (data.intent as string) ?? null,
    assignedAgentId: data.agent_id != null ? String(data.agent_id) : null,
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function findLeadByEmail(email: string): Promise<EmailLeadSnapshot | null> {
  const norm = normalizeEmail(email);
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select(leadSelect)
    .ilike("email", norm)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return emailLeadRowToSnapshot(data as Record<string, unknown>);
}

export async function createEmailLeadIfMissing(params: {
  email: string;
  name?: string | null;
  source?: string;
  intent?: string;
}): Promise<EmailLeadSnapshot> {
  const norm = normalizeEmail(params.email);
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .insert({
      agent_id: null,
      email: norm,
      name: params.name?.trim() || null,
      source: params.source || "email_inbound",
      intent: params.intent || "unknown",
      lead_status: "new",
    } as Record<string, unknown>)
    .select(leadSelect)
    .single();

  if (error) throw error;
  return emailLeadRowToSnapshot(data as Record<string, unknown>);
}

export async function getRecentEmailMessages(leadId: string, limit = 8) {
  const { data, error } = await supabaseAdmin
    .from("email_messages")
    .select("direction, subject, message, created_at")
    .eq("contact_id", leadId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data || [])
    .reverse()
    .map((row: { direction: string; subject: string; message: string; created_at: string }) => ({
      direction: row.direction as "inbound" | "outbound",
      subject: row.subject,
      body: row.message,
      createdAt: row.created_at,
    }));
}

export async function logEmailMessage(params: {
  leadId: string;
  direction: "inbound" | "outbound";
  subject: string;
  body: string;
  agentId?: string | null;
  externalMessageId?: string | null;
}) {
  const { error } = await supabaseAdmin.from("email_messages").insert({
    contact_id: params.leadId,
    agent_id: params.agentId ?? null,
    subject: params.subject || "",
    message: params.body,
    direction: params.direction,
    external_message_id: params.externalMessageId ?? null,
  } as Record<string, unknown>);

  if (error) throw error;
}

export async function applyEmailExtractedLeadFields(
  leadId: string,
  extracted: NonNullable<EmailAssistantReply["extractedData"]>,
  inferredIntent: string
) {
  const patch: Record<string, unknown> = {};
  if (extracted.name?.trim()) patch.name = extracted.name.trim();
  if (extracted.email?.trim()) patch.email = normalizeEmail(extracted.email);
  if (extracted.phone?.trim()) {
    patch.phone = extracted.phone.trim();
  }
  if (extracted.propertyAddress?.trim()) patch.property_address = extracted.propertyAddress.trim();
  if (inferredIntent && inferredIntent !== "unknown") patch.intent = inferredIntent;
  if (Object.keys(patch).length === 0) return;
  await supabaseAdmin.from("contacts").update(patch).eq("id", leadId);
}