import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SmsLeadSnapshot } from "./types";
import { buildSmsContactPatch, type SmsExtractedData } from "./extractedPatch";

function digitsOnly(input: string) {
  return input.replace(/\D/g, "");
}

/** Twilio E.164 or local -> stored US display e.g. (555) 123-4567 */
export function normalizeTwilioFromToUsPhone(from: string): string | null {
  const d = digitsOnly(from).slice(-10);
  if (d.length !== 10) return null;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function leadRowToSnapshot(data: Record<string, unknown>): SmsLeadSnapshot {
  return {
    leadId: data.id != null ? String(data.id) : null,
    name: (data.name as string) ?? null,
    email: (data.email as string) ?? null,
    phone: ((data.phone_number as string) ?? (data.phone as string)) || null,
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

export async function findLeadByPhone(phoneDisplay: string): Promise<SmsLeadSnapshot | null> {
  const fromDigits = digitsOnly(phoneDisplay);

  let data: Record<string, unknown> | null = null;

  try {
    const { data: byPn, error: e1 } = await supabaseAdmin
      .from("contacts")
      .select(
        "id,name,email,phone,phone_number,lead_status,status,nurture_score,rating,property_address,city,state,intent,agent_id"
      )
      .eq("phone_number", phoneDisplay)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e1) throw e1;
    data = (byPn as Record<string, unknown>) ?? null;
  } catch {
    // fallback below
  }

  if (!data) {
    const { data: byPhone, error: e2 } = await supabaseAdmin
      .from("contacts")
      .select(
        "id,name,email,phone,phone_number,lead_status,status,nurture_score,rating,property_address,city,state,intent,agent_id"
      )
      .eq("phone", phoneDisplay)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e2) throw e2;
    data = (byPhone as Record<string, unknown>) ?? null;
  }

  if (!data && fromDigits.length >= 10) {
    const tail = fromDigits.slice(-10);
    const { data: byDigitsPhone, error: e3a } = await supabaseAdmin
      .from("contacts")
      .select(
        "id,name,email,phone,phone_number,lead_status,status,nurture_score,rating,property_address,city,state,intent,agent_id"
      )
      .ilike("phone", `%${tail}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e3a) throw e3a;
    data = (byDigitsPhone as Record<string, unknown>) ?? null;
    if (!data) {
      const { data: byDigitsPn, error: e3b } = await supabaseAdmin
        .from("contacts")
        .select(
          "id,name,email,phone,phone_number,lead_status,status,nurture_score,rating,property_address,city,state,intent,agent_id"
        )
        .ilike("phone_number", `%${tail}%`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (e3b) throw e3b;
      data = (byDigitsPn as Record<string, unknown>) ?? null;
    }
  }

  if (!data) return null;
  return leadRowToSnapshot(data);
}

export async function createSmsLeadIfMissing(params: {
  phoneDisplay: string;
  source?: string;
  intent?: string;
}): Promise<SmsLeadSnapshot> {
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .insert({
      agent_id: null,
      phone: params.phoneDisplay,
      phone_number: params.phoneDisplay,
      source: params.source || "sms_inbound",
      intent: params.intent || "unknown",
      lead_status: "new",
      sms_opt_in: true,
    } as Record<string, unknown>)
    .select(
      "id,name,email,phone,phone_number,lead_status,status,nurture_score,rating,property_address,city,state,intent,agent_id"
    )
    .single();

  if (error) throw error;
  return leadRowToSnapshot(data as Record<string, unknown>);
}

export async function getRecentSmsMessages(leadId: string, limit = 8) {
  const { data, error } = await supabaseAdmin
    .from("sms_messages")
    .select("direction, message, created_at")
    .eq("contact_id", leadId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data || [])
    .reverse()
    .map((row: { direction: string; message: string; created_at: string }) => ({
      direction: row.direction as "inbound" | "outbound",
      body: row.message,
      createdAt: row.created_at,
    }));
}

export async function logSmsActivity(params: {
  leadId: string;
  eventType: string;
  metadata?: Record<string, unknown>;
}) {
  await supabaseAdmin.rpc("log_lead_event", {
    p_contact_id: params.leadId,
    p_event_type: params.eventType,
    p_metadata: params.metadata || {},
  });
}

export async function applySmsExtractedLeadFields(
  leadId: string,
  extracted: SmsExtractedData | null | undefined,
  inferredIntent: string,
) {
  // Read first: identity fields fill a blank rather than overwrite, so the
  // builder has to know what is already on file. Without this it would rename
  // a contact whenever a text was signed differently.
  const { data: current, error: readError } = await supabaseAdmin
    .from("contacts")
    .select("name, email, preferred_language, lead_type")
    .eq("id", leadId)
    .maybeSingle();

  if (readError) {
    console.error("[ai-sms] could not read contact before saving what the lead told us:", readError);
  }

  const patch = buildSmsContactPatch(extracted, inferredIntent, current);
  if (Object.keys(patch).length === 0) return;

  // Report the failure. This used to discard its result, so a rejected write
  // — a bad column, a constraint — looked exactly like a saved one.
  const { error } = await supabaseAdmin.from("contacts").update(patch).eq("id", leadId);
  if (error) {
    console.error("[ai-sms] could not save what the lead told us:", error, Object.keys(patch));
  }
}
