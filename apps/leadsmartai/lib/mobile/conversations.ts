import { supabaseAdmin } from "@/lib/supabase/admin";
import type { MobileCallDto, MobileEmailMessageDto, MobileSmsMessageDto } from "@leadsmart/shared";
import { OWN_MESSAGES_FILTER } from "@/lib/email/ownMessages";

const RECENT_SMS_LIMIT = 120;
const RECENT_EMAIL_LIMIT = 120;
const RECENT_CALLS_LIMIT = 100;

function asDirection(raw: string | undefined): "inbound" | "outbound" {
  return raw === "inbound" ? "inbound" : "outbound";
}

/**
 * Recent calls for a lead, oldest-first, shaped for the same thread as texts
 * and email. `call_logs.notes` holds the receptionist's AI summary — often the
 * most informative thing this contact said all week — and the web thread has
 * shown it beside SMS since #1490; the app's lead screen did not, so tapping a
 * call in the inbox opened a page with no call on it.
 *
 * A read failure returns an empty list rather than throwing: one broken
 * channel must not blank the whole lead screen.
 */
export async function fetchRecentCallsForLead(leadId: string): Promise<MobileCallDto[]> {
  const { data, error } = await supabaseAdmin
    .from("call_logs")
    .select("id,direction,status,duration_seconds,notes,created_at")
    .eq("contact_id", leadId as unknown as number)
    .order("created_at", { ascending: false })
    .limit(RECENT_CALLS_LIMIT);

  if (error) {
    console.warn("[mobile/conversations] call fetch", error.message);
    return [];
  }

  const rows = (data ?? []).map((r) => {
    const row = r as {
      id: unknown;
      direction?: string;
      status?: string | null;
      duration_seconds?: number | null;
      notes?: unknown;
      created_at: string;
    };
    return {
      id: String(row.id),
      summary: String(row.notes ?? "").trim(),
      direction: asDirection(row.direction),
      status: row.status != null ? String(row.status) : null,
      duration_seconds: typeof row.duration_seconds === "number" ? row.duration_seconds : null,
      created_at: row.created_at,
    };
  });

  return rows.reverse();
}

/**
 * Recent SMS for a lead, oldest-first (matches dashboard sms-conversation ordering).
 */
export async function fetchRecentSmsForLead(leadId: string): Promise<MobileSmsMessageDto[]> {
  const { data, error } = await supabaseAdmin
    .from("sms_messages")
    .select("id,message,direction,created_at")
    .eq("contact_id", leadId)
    .order("created_at", { ascending: false })
    .limit(RECENT_SMS_LIMIT);

  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((r) => {
    const row = r as {
      id: unknown;
      message?: unknown;
      direction?: string;
      created_at: string;
    };
    return {
      id: String(row.id),
      message: String(row.message ?? ""),
      direction: asDirection(row.direction),
      created_at: row.created_at,
    };
  });

  return rows.reverse();
}

/**
 * Recent email for a lead, oldest-first.
 */
export async function fetchRecentEmailForLead(leadId: string): Promise<MobileEmailMessageDto[]> {
  const { data, error } = await supabaseAdmin
    .from("email_messages")
    .select("id,subject,message,direction,created_at")
    .eq("contact_id", leadId)
    .or(OWN_MESSAGES_FILTER)
    .order("created_at", { ascending: false })
    .limit(RECENT_EMAIL_LIMIT);

  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((r) => {
    const row = r as {
      id: unknown;
      subject?: string | null;
      message?: unknown;
      direction?: string;
      created_at: string;
    };
    const sub = row.subject != null ? String(row.subject).trim() : "";
    return {
      id: String(row.id),
      subject: sub.length ? sub : null,
      message: String(row.message ?? ""),
      direction: asDirection(row.direction),
      created_at: row.created_at,
    };
  });

  return rows.reverse();
}
