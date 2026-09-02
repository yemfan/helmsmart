import { supabaseAdmin } from "@/lib/supabase/admin";
import type { MobileEmailMessageDto, MobileSmsMessageDto } from "@leadsmart/shared";
import { OWN_MESSAGES_FILTER } from "@/lib/email/ownMessages";

const RECENT_SMS_LIMIT = 120;
const RECENT_EMAIL_LIMIT = 120;

function asDirection(raw: string | undefined): "inbound" | "outbound" {
  return raw === "inbound" ? "inbound" : "outbound";
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
