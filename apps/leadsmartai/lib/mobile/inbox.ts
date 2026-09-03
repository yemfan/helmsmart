import { supabaseAdmin } from "@/lib/supabase/admin";
import type { MobileInboxThreadDto } from "@leadsmart/shared";
import { OWN_MESSAGES_FILTER } from "@/lib/email/ownMessages";

const PREVIEW_LEN = 160;
const MAX_LEADS = 400;
const LEAD_ID_CHUNK = 50;
const MESSAGES_PER_LEAD_CHUNK = 200;
/** Align with SMS webhook hot-alert dedup horizon (slightly wider for inbox UX). */
const HOT_NURTURE_LOOKBACK_HOURS = 72;

function previewText(text: string, max = PREVIEW_LEN) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type LeadInboxMeta = { name: string | null; rating: string | null };

async function leadInboxMetaMap(agentId: string, leadIds: string[]): Promise<Map<string, LeadInboxMeta>> {
  const map = new Map<string, LeadInboxMeta>();
  if (!leadIds.length) return map;
  for (const part of chunk(leadIds, LEAD_ID_CHUNK)) {
    const { data, error } = await supabaseAdmin
      .from("contacts")
      .select("id,name,rating")
      .eq("agent_id", agentId as unknown as number)
      .in("id", part as unknown as number[]);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const r = row as { id: unknown; name: string | null; rating: string | null };
      map.set(String(r.id), {
        name: r.name ?? null,
        rating: r.rating != null ? String(r.rating) : null,
      });
    }
  }
  return map;
}

async function hotNurtureLeadIds(leadIds: string[]): Promise<Set<string>> {
  const acc = new Set<string>();
  if (!leadIds.length) return acc;
  const since = new Date(Date.now() - HOT_NURTURE_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  for (const part of chunk(leadIds, LEAD_ID_CHUNK)) {
    const { data, error } = await supabaseAdmin
      .from("nurture_alerts")
      .select("contact_id")
      .in("contact_id", part as unknown as number[])
      .eq("type", "hot")
      .gte("created_at", since);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      acc.add(String((row as { contact_id: unknown }).contact_id));
    }
  }
  return acc;
}

type MsgRow = {
  id: string;
  contact_id: unknown;
  message: string;
  subject?: string;
  direction: string;
  created_at: string;
};

async function fetchSmsForLeads(leadIds: string[]): Promise<MsgRow[]> {
  const acc: MsgRow[] = [];
  for (const part of chunk(leadIds, LEAD_ID_CHUNK)) {
    const { data, error } = await supabaseAdmin
      .from("sms_messages")
      .select("id,contact_id,message,direction,created_at")
      .in("contact_id", part as unknown as number[])
      .order("created_at", { ascending: false })
      .limit(MESSAGES_PER_LEAD_CHUNK);
    // Defensive: a missing table or schema-cache hiccup must not kill the
    // whole conversations view. Log and keep aggregating.
    if (error) {
      console.warn("[mobile/inbox] sms fetch", error.message);
      continue;
    }
    for (const r of data ?? []) acc.push(r as unknown as MsgRow);
  }
  return acc;
}

async function fetchEmailForLeads(leadIds: string[]): Promise<MsgRow[]> {
  const acc: MsgRow[] = [];
  for (const part of chunk(leadIds, LEAD_ID_CHUNK)) {
    const { data, error } = await supabaseAdmin
      .from("email_messages")
      .select("id,contact_id,subject,message,direction,created_at")
      .in("contact_id", part as unknown as number[])
      // CloseBoss shows CloseBoss's conversations — see lib/email/ownMessages.
      .or(OWN_MESSAGES_FILTER)
      .order("created_at", { ascending: false })
      .limit(MESSAGES_PER_LEAD_CHUNK);
    // email_messages is currently absent in prod (migration drift). The
    // SMS half should still render — swallow the error and keep going.
    if (error) {
      console.warn("[mobile/inbox] email fetch", error.message);
      continue;
    }
    for (const r of data ?? []) acc.push(r as unknown as MsgRow);
  }
  return acc;
}

type CallRow = {
  id: string;
  contact_id: unknown;
  direction: string;
  status: string | null;
  duration_seconds: number | null;
  notes: string | null;
  created_at: string;
};

/**
 * Calls belong in the conversation list because they are a conversation.
 *
 * call_logs.notes holds the AI call summary — "The user called to inquire about
 * buying a home in Alhambra with a budget of…" — which is often the most
 * informative thing anyone said to this agent all week, and until now it was
 * only visible on the Calls page, never threaded beside that contact's texts
 * and email.
 *
 * Only calls carrying a contact_id can thread. Roughly a quarter of call_logs
 * rows have none (the receptionist could not match the caller to a contact),
 * and those stay invisible here — that gap belongs to the call-to-contact
 * pipeline, not to this view.
 */
async function fetchCallsForLeads(leadIds: string[]): Promise<CallRow[]> {
  const acc: CallRow[] = [];
  for (const part of chunk(leadIds, LEAD_ID_CHUNK)) {
    const { data, error } = await supabaseAdmin
      .from("call_logs")
      .select("id,contact_id,direction,status,duration_seconds,notes,created_at")
      .in("contact_id", part as unknown as number[])
      .order("created_at", { ascending: false })
      .limit(MESSAGES_PER_LEAD_CHUNK);
    // Same defence as the other two fetches: one bad channel must not empty
    // the whole conversations view.
    if (error) {
      console.warn("[mobile/inbox] call fetch", error.message);
      continue;
    }
    for (const row of data ?? []) acc.push(row as unknown as CallRow);
  }
  return acc;
}

function isHotLeadForThread(
  leadId: string,
  meta: LeadInboxMeta | undefined,
  hotNurture: Set<string>
): boolean {
  const rating = (meta?.rating ?? "").trim().toLowerCase();
  if (rating === "hot") return true;
  return hotNurture.has(leadId);
}

/**
 * Latest SMS + email activity per lead for this agent (DB-scoped by lead id batches).
 */
export async function getMobileInbox(
  agentId: string,
  /**
   * Calls are opt-in so the mobile endpoint keeps returning exactly what the
   * shipped app expects. The web dashboard passes true; /api/mobile/inbox does
   * not, until the app has a call row to render.
   */
  options: { includeCalls?: boolean } = {},
): Promise<MobileInboxThreadDto[]> {
  const { data: leadRows, error: leadErr } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("agent_id", agentId as unknown as number)
    .is("merged_into_lead_id", null)
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .limit(MAX_LEADS);

  if (leadErr) throw new Error(leadErr.message);
  const leadIds = (leadRows ?? []).map((r) => String((r as { id: unknown }).id)).filter(Boolean);
  if (!leadIds.length) return [];

  const [metaByLead, hotNurture] = await Promise.all([
    leadInboxMetaMap(agentId, leadIds),
    hotNurtureLeadIds(leadIds),
  ]);
  const leadIdSet = new Set(leadIds);

  const [smsRows, emailRows, callRows] = await Promise.all([
    fetchSmsForLeads(leadIds),
    fetchEmailForLeads(leadIds),
    options.includeCalls ? fetchCallsForLeads(leadIds) : Promise.resolve([] as CallRow[]),
  ]);

  smsRows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  emailRows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const threads: MobileInboxThreadDto[] = [];

  const seenSms = new Set<string>();
  for (const r of smsRows) {
    const lid = String(r.contact_id);
    if (!leadIdSet.has(lid)) continue;
    const key = `${lid}:sms`;
    if (seenSms.has(key)) continue;
    seenSms.add(key);
    const meta = metaByLead.get(lid);
    threads.push({
      leadId: lid,
      channel: "sms",
      leadName: meta?.name ?? null,
      preview: previewText(r.message || ""),
      lastMessageAt: r.created_at,
      lastDirection: r.direction === "inbound" ? "inbound" : "outbound",
      messageId: r.id,
      isHotLead: isHotLeadForThread(lid, meta, hotNurture),
    });
  }

  const seenEmail = new Set<string>();
  for (const r of emailRows) {
    const lid = String(r.contact_id);
    if (!leadIdSet.has(lid)) continue;
    const key = `${lid}:email`;
    if (seenEmail.has(key)) continue;
    seenEmail.add(key);
    const sub = (r.subject || "").trim();
    const body = previewText(r.message || "");
    const preview = sub ? previewText(`${sub} — ${body}`, 200) : body;
    const meta = metaByLead.get(lid);
    threads.push({
      leadId: lid,
      channel: "email",
      leadName: meta?.name ?? null,
      preview,
      lastMessageAt: r.created_at,
      lastDirection: r.direction === "inbound" ? "inbound" : "outbound",
      messageId: r.id,
      isHotLead: isHotLeadForThread(lid, meta, hotNurture),
    });
  }

  const seenCall = new Set<string>();
  for (const row of callRows) {
    const lid = String(row.contact_id);
    if (!leadIdSet.has(lid)) continue;
    const key = `${lid}:call`;
    if (seenCall.has(key)) continue;
    seenCall.add(key);
    const meta = metaByLead.get(lid);
    threads.push({
      leadId: lid,
      channel: "call",
      leadName: meta?.name ?? null,
      // The summary, or nothing. A call with no summary gets an empty preview
      // rather than invented filler describing a call nobody transcribed.
      preview: previewText(row.notes || ""),
      lastMessageAt: row.created_at,
      lastDirection: row.direction === "inbound" ? "inbound" : "outbound",
      messageId: row.id,
      isHotLead: isHotLeadForThread(lid, meta, hotNurture),
    });
  }

  threads.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  return threads.slice(0, 100);
}
