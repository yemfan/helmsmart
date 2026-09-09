"use server";

import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getServerT } from "@/lib/i18n/server";

export interface LogCommunicationInput {
  clientId: string;
  type: "call" | "sms" | "email" | "note" | "appointment" | "other";
  direction?: "inbound" | "outbound";
  status?: "pending" | "sent" | "delivered" | "failed" | "completed";
  body?: string;
  subject?: string;
  durationSeconds?: number;
  fromPhoneNumber?: string;
  fromEmail?: string;
  toPhoneNumber?: string;
  toEmail?: string;
  twilioCallSid?: string;
  twilioMessageSid?: string;
  emailMessageId?: string;
  appointmentId?: string;
  fromAiEmployeeId?: string;
  sentiment?: "positive" | "neutral" | "negative";
  aiSummary?: string;
}

/**
 * Log a communication event for a client
 */
export async function logCommunication(
  input: LogCommunicationInput
): Promise<{ ok: boolean; logId?: string; error?: string }> {
  const t = await getServerT("clients");
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { ok: false, error: t("errors.unauthorized") };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const db = await createServiceClient();

  const { data: log, error } = await db
    .from("communication_logs")
    .insert({
      organization_id: orgId,
      client_id: input.clientId,
      type: input.type,
      direction: input.direction,
      status: input.status,
      body: input.body,
      subject: input.subject,
      duration_seconds: input.durationSeconds,
      from_phone_number: input.fromPhoneNumber,
      from_email: input.fromEmail,
      to_phone_number: input.toPhoneNumber,
      to_email: input.toEmail,
      twilio_call_sid: input.twilioCallSid,
      twilio_message_sid: input.twilioMessageSid,
      email_message_id: input.emailMessageId,
      appointment_id: input.appointmentId,
      from_user_id: user?.id,
      from_ai_employee_id: input.fromAiEmployeeId,
      sentiment: input.sentiment,
      ai_summary: input.aiSummary,
    })
    .select("id")
    .single();

  if (error || !log) {
    console.error("[communication-logs] insert error:", error);
    return { ok: false, error: t("errors.logFailed") };
  }

  revalidatePath(`/clients/${input.clientId}`);
  return { ok: true, logId: log.id };
}

/**
 * Get communication timeline for a client
 */
export async function getClientCommunications(
  clientId: string,
  limit = 100,
  type?: string
) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return [];

  const supabase = await createClient();

  let query = supabase
    .from("communication_logs")
    .select(
      `id, type, direction, status, body, subject, duration_seconds,
       from_phone_number, to_phone_number, from_email, to_email,
       sentiment, ai_summary, created_at,
       from_user_id, from_ai_employee_id`
    )
    .eq("organization_id", orgId)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (type) {
    query = query.eq("type", type);
  }

  const { data: logs } = await query;
  return logs ?? [];
}

/**
 * Get communication preferences for a client
 */
export async function getClientPreferences(clientId: string) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return null;

  const supabase = await createClient();

  const { data: prefs } = await supabase
    .from("communication_preferences")
    .select("*")
    .eq("organization_id", orgId)
    .eq("client_id", clientId)
    .single();

  return prefs;
}

/**
 * Update communication preferences for a client
 */
export async function updateClientPreferences(
  clientId: string,
  preferences: {
    optedOutSms?: boolean;
    optedOutEmail?: boolean;
    optedOutCalls?: boolean;
    preferredContactMethod?: string;
    bestTimeToContact?: string;
    notes?: string;
  }
): Promise<{ ok: boolean; error?: string }> {
  const t = await getServerT("clients");
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { ok: false, error: t("errors.unauthorized") };

  const db = await createServiceClient();

  const { error } = await db
    .from("communication_preferences")
    .upsert(
      {
        organization_id: orgId,
        client_id: clientId,
        opted_out_sms: preferences.optedOutSms,
        opted_out_email: preferences.optedOutEmail,
        opted_out_calls: preferences.optedOutCalls,
        preferred_contact_method: preferences.preferredContactMethod,
        best_time_to_contact: preferences.bestTimeToContact,
        notes: preferences.notes,
      },
      { onConflict: "organization_id,client_id" }
    );

  if (error) {
    console.error("[communication-prefs] update error:", error);
    return { ok: false, error: t("errors.preferencesFailed") };
  }

  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

/**
 * Get communication stats for a client
 */
export async function getClientCommunicationStats(clientId: string) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return null;

  const supabase = await createClient();

  const { data: logs } = await supabase
    .from("communication_logs")
    .select("type, direction, sentiment, created_at")
    .eq("organization_id", orgId)
    .eq("client_id", clientId);

  if (!logs) return { total: 0, byType: {}, lastContact: null };

  const byType: Record<string, number> = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let lastContact: Date | null = null;

  logs.forEach((log) => {
    byType[log.type] = (byType[log.type] || 0) + 1;
    const logDate = new Date(log.created_at);
    if (!lastContact || logDate > lastContact) {
      lastContact = logDate;
    }
  });

  return {
    total: logs.length,
    byType,
    lastContact,
    recentCount: logs.filter((l) => new Date(l.created_at) >= today).length,
  };
}
