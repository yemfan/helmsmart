"use server";

import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getServerT } from "@/lib/i18n/server";
import type { ClientCommunicationPreferences } from "@/lib/communication-preferences";
import { clearEmailOptOut, clearSmsOptOut } from "@/lib/consent";

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
 * Update communication preferences for a client, and PROVE a row changed.
 *
 * These are consent flags on outbound messaging, so a save that reports success
 * without writing anything is the worst possible failure: the panel says "do not
 * text this client" was recorded and the next campaign texts them anyway.
 *
 * Two things guard that. The payload keys come from
 * `ClientCommunicationPreferences`, whose field names ARE the column names — the
 * mapping below is a 1:1 read, and a rename on either side stops compiling. And
 * the write goes through the RLS-enforced client with `.select("id")`, because a
 * policy-refused update is not an error: it matches zero rows and comes back
 * clean. See CLAUDE.md, "A save that reports success must have changed a row",
 * and `lib/actions/org-update.ts` for the same shape.
 */
export async function updateClientPreferences(
  clientId: string,
  preferences: ClientCommunicationPreferences
): Promise<{ ok: boolean; error?: string }> {
  const t = await getServerT("clients");
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { ok: false, error: t("errors.unauthorized") };

  // RLS-enforced, not the service client: the org id comes from a cookie, and
  // the policies on communication_preferences are what confine this write to an
  // org the signed-in user actually belongs to.
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("communication_preferences")
    .upsert(
      {
        organization_id: orgId,
        client_id: clientId,
        opted_out_sms: preferences.opted_out_sms,
        opted_out_email: preferences.opted_out_email,
        opted_out_calls: preferences.opted_out_calls,
        preferred_contact_method: preferences.preferred_contact_method,
        best_time_to_contact: preferences.best_time_to_contact,
        notes: preferences.notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,client_id" }
    )
    .select("id"); // ← load-bearing: without it a refusal is indistinguishable from a save

  if (error) {
    console.error("[communication-prefs] update error:", error);
    return { ok: false, error: t("errors.preferencesFailed") };
  }

  if (!data || data.length === 0) {
    // No error and no rows: the existing row is not one this user may write, or
    // the org id in the cookie does not resolve. Either way nothing was saved.
    console.error("[communication-prefs] update changed no rows", {
      orgId,
      clientId,
    });
    return { ok: false, error: t("errors.preferencesRefused") };
  }

  /*
   * The switch is the owner's answer for every source, not only this row. A
   * STOP reply or a campaign unsubscribe is recorded by number/address too, and
   * the page shows the switch ON for it — so switching it OFF has to clear
   * those as well, or the switch would read "off" over sends that are still
   * refused. (Twilio keeps enforcing a STOP itself until the person texts
   * START; a refused send then records the opt-out again, with that reason.)
   * Same RLS client: the upsert above just proved this user may write here.
   */
  if (!preferences.opted_out_sms || !preferences.opted_out_email) {
    const { data: client } = await supabase
      .from("clients")
      .select("phone, email")
      .eq("id", clientId)
      .eq("organization_id", orgId)
      .maybeSingle();
    const row = client as { phone?: string | null; email?: string | null } | null;
    if (!preferences.opted_out_sms && row?.phone) await clearSmsOptOut(supabase, orgId, row.phone);
    if (!preferences.opted_out_email && row?.email) await clearEmailOptOut(supabase, orgId, row.email);
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
