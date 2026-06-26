import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { loadAgentSignatureProfile } from "@/lib/signatures/loadProfile";
import {
  appendHtmlSignature,
  appendTextSignature,
  composeSignature,
} from "@/lib/signatures/compose";
import { sendSMS } from "@/lib/twilioSms";
import { getAgentMessageSettingsEffective } from "@/lib/agent-messaging/settings";
import type { AgentMessageSettingsEffective } from "@/lib/agent-messaging/types";
import type { DraftChannel, MessageDraft, MessageDraftRow } from "./types";

export type DispatchReason =
  | "sent"
  | "quiet_hours"
  | "sunday_morning"
  | "chinese_new_year"
  | "per_contact_cap"
  | "do_not_contact"
  | "paused_on_reply"
  | "missing_address"
  | "send_failed";

export type DispatchOutcome = {
  draftId: string;
  reason: DispatchReason;
  detail?: string;
};

export type DispatchResult = {
  processed: number;
  sent: number;
  deferred: number;
  failed: number;
  outcomes: DispatchOutcome[];
};

type SenderOptions = {
  /** Limit to a specific agent (defaults to all agents). */
  agentId?: string;
  /** Limit to a specific draft id (used by manual "Send now"). */
  draftId?: string;
  /** Max drafts to try per invocation (default 50). */
  limit?: number;
};

type FullDraftRow = MessageDraftRow & {
  sphere_contacts: {
    id: string;
    phone: string | null;
    email: string | null;
    do_not_contact_sms: boolean;
    do_not_contact_email: boolean;
    preferred_language: "en" | "zh";
  };
};

/**
 * Main dispatch loop. Reads `status='approved'` drafts, runs compliance +
 * frequency guardrails, and calls Twilio/Resend. Keeps drafts as 'approved'
 * when guardrails defer the send (so the next cron tick retries); flips to
 * 'sent' / 'failed' when terminal.
 *
 * Transient errors (provider outage, missing config) bump a retry window on
 * `scheduled_for` but leave status='approved'. Permanent blocks (DNC, missing
 * phone/email) flip to 'failed' so we don't loop forever.
 */
export async function dispatchApprovedDrafts(
  opts: SenderOptions = {},
): Promise<DispatchResult> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);

  let q = supabaseAdmin
    .from("message_drafts")
    .select(
      "*, sphere_contacts!inner(id, phone, email, do_not_contact_sms, do_not_contact_email, preferred_language)",
    )
    .eq("status", "approved")
    .order("approved_at", { ascending: true })
    .limit(limit);
  if (opts.agentId) q = q.eq("agent_id", opts.agentId);
  if (opts.draftId) q = q.eq("id", opts.draftId);

  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as unknown as FullDraftRow[];

  const outcomes: DispatchOutcome[] = [];
  let sent = 0;
  let deferred = 0;
  let failed = 0;

  // Cache settings per agent so a single cron pass doesn't hit the view N times.
  const settingsCache = new Map<string, AgentMessageSettingsEffective | null>();
  const now = new Date();

  for (const row of rows) {
    const outcome = await processOne(row, now, settingsCache);
    outcomes.push(outcome);
    if (outcome.reason === "sent") sent++;
    else if (outcome.reason === "do_not_contact" || outcome.reason === "missing_address")
      failed++;
    else deferred++;
  }

  return { processed: rows.length, sent, deferred, failed, outcomes };
}

async function processOne(
  row: FullDraftRow,
  now: Date,
  settingsCache: Map<string, AgentMessageSettingsEffective | null>,
): Promise<DispatchOutcome> {
  const draftId = row.id;
  const contact = row.sphere_contacts;

  // Permanent blocks first — fail the draft so it drops out of the queue.
  if (row.channel === "sms" && (contact.do_not_contact_sms || !contact.phone)) {
    await markFailed(draftId, "contact opted out of SMS or has no phone");
    return {
      draftId,
      reason: contact.do_not_contact_sms ? "do_not_contact" : "missing_address",
    };
  }
  if (row.channel === "email" && (contact.do_not_contact_email || !contact.email)) {
    await markFailed(draftId, "contact opted out of email or has no address");
    return {
      draftId,
      reason: contact.do_not_contact_email ? "do_not_contact" : "missing_address",
    };
  }

  // Load agent settings (effective — includes §2.4 onboarding gate).
  let settings = settingsCache.get(row.agent_id);
  if (settings === undefined) {
    settings = await getAgentMessageSettingsEffective(row.agent_id);
    settingsCache.set(row.agent_id, settings);
  }

  // Timing guardrails — defer rather than fail.
  if (settings) {
    const block = inQuietHours(now, settings);
    if (block) {
      await deferDraft(draftId, nextDispatchAfter(now, block, settings));
      return { draftId, reason: block };
    }
    if (await exceededPerContactCap(row.contact_id, settings.maxPerContactPerDay, now)) {
      await deferDraft(draftId, startOfTomorrow(now));
      return { draftId, reason: "per_contact_cap" };
    }
    if (await pausedOnReply(row.contact_id, settings.pauseOnReplyDays, now)) {
      await deferDraft(draftId, addDays(now, settings.pauseOnReplyDays));
      return { draftId, reason: "paused_on_reply" };
    }
  }

  // Actual send.
  try {
    if (row.channel === "sms") {
      // SMS doesn't carry signatures — the character cap + SMS norms
      // mean the agent's identity is implicit in the sender number.
      await sendSMS(contact.phone!, row.body);
    } else {
      // Append the agent's signature to every outbound email. Custom
      // signatureHtml on the agent row wins; otherwise we compose a
      // default from their profile + branding. Drafts flagged
      // `suppress_signature=true` (future per-send override) skip.
      const sigProfile = await loadAgentSignatureProfile(row.agent_id);
      const sig = sigProfile ? composeSignature(sigProfile) : null;
      const skipSig =
        (row as { suppress_signature?: boolean }).suppress_signature === true;
      const text = sig
        ? appendTextSignature(row.body, sig, { skip: skipSig })
        : row.body;
      // Drafts today send as text-only. Omit the html field to keep
      // current delivery semantics; the text signature is enough until
      // the draft composer grows an HTML mode.
      // Kept as a separate const so a future HTML-mode toggle drops in cleanly.
      void appendHtmlSignature;
      await sendEmail({
        to: contact.email!,
        subject: row.subject ?? "(no subject)",
        text,
      });
    }
    await markSent(draftId);

    // RealtyBoss activity feed — sphere/nurture touches are the
    // Marketing Assistant's work (fire-and-forget, never fails the send).
    void (async () => {
      const { logAssistantActivity } = await import("@/lib/realtorboss/activities");
      void logAssistantActivity({
        agentId: String(row.agent_id),
        assistantType: "marketing_assistant",
        activityType: "nurture_message_sent",
        summary: `Sent an approved nurture ${row.channel === "sms" ? "text" : "email"} to a sphere contact`,
        outcome: row.body.length > 140 ? `${row.body.slice(0, 137)}…` : row.body,
        requiresAttention: false,
      });
    })();

    return { draftId, reason: "sent" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Send failed";
    // Transient errors — defer with a short retry window instead of failing.
    const isConfigError = /not configured|missing/i.test(msg);
    if (isConfigError) {
      await deferDraft(draftId, addMinutes(now, 60));
      return { draftId, reason: "send_failed", detail: msg };
    }
    await markFailed(draftId, msg);
    return { draftId, reason: "send_failed", detail: msg };
  }
}

// ---------- guardrails ----------

function inQuietHours(
  now: Date,
  s: AgentMessageSettingsEffective,
): "quiet_hours" | "sunday_morning" | "chinese_new_year" | null {
  // Sunday morning rule (§2.8): no messages Sunday before noon in agent local.
  if (s.noSundayMorning && now.getDay() === 0 && now.getHours() < 12) {
    return "sunday_morning";
  }
  if (s.pauseChineseNewYear && inChineseNewYearWindow(now)) {
    return "chinese_new_year";
  }
  // Quiet hours — agent-local. Per spec the flag `use_contact_timezone` is per-contact,
  // not used here yet (we don't have tz on contacts). Fall back to agent-local clock.
  const [h1, m1] = s.quietHoursStart.split(":").map(Number);
  const [h2, m2] = s.quietHoursEnd.split(":").map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  const startMins = h1 * 60 + m1;
  const endMins = h2 * 60 + m2;
  const inWindow =
    startMins < endMins
      ? mins >= startMins && mins < endMins
      : mins >= startMins || mins < endMins; // crosses midnight
  return inWindow ? "quiet_hours" : null;
}

/** Approximate CNY detection — actual lunar date varies. Uses a hardcoded table
 *  for 2026-2030; expand as needed. TODO: pull from a lunar-calendar library. */
function inChineseNewYearWindow(now: Date): boolean {
  const cnyByYear: Record<number, [string, string]> = {
    2026: ["2026-02-17", "2026-02-21"],
    2027: ["2027-02-06", "2027-02-10"],
    2028: ["2028-01-26", "2028-01-30"],
    2029: ["2029-02-13", "2029-02-17"],
    2030: ["2030-02-03", "2030-02-07"],
  };
  const year = now.getFullYear();
  const range = cnyByYear[year];
  if (!range) return false;
  const iso = now.toISOString().slice(0, 10);
  return iso >= range[0] && iso <= range[1];
}

async function exceededPerContactCap(
  contactId: string,
  cap: number,
  now: Date,
): Promise<boolean> {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const { count } = await supabaseAdmin
    .from("message_drafts")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", contactId)
    .eq("status", "sent")
    .gte("sent_at", startOfToday.toISOString());
  return (count ?? 0) >= cap;
}

async function pausedOnReply(
  _contactId: string,
  _pauseDays: number,
  _now: Date,
): Promise<boolean> {
  // TODO: wire to `communications` table (inbound messages) once the thread
  // model is unified across leads + sphere contacts. For now this is a stub
  // that never blocks — the agent-level policy still captures pause-on-reply
  // in the UI, but the sender doesn't yet know about inbound replies.
  return false;
}

// ---------- state transitions ----------

async function markSent(draftId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("message_drafts")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
    } as never)
    .eq("id", draftId);
  if (error) throw error;
}

async function markFailed(draftId: string, reason: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("message_drafts")
    .update({
      status: "failed",
      failed_at: new Date().toISOString(),
      failure_reason: reason.slice(0, 500),
    } as never)
    .eq("id", draftId);
  if (error) throw error;
}

async function deferDraft(draftId: string, retryAt: Date): Promise<void> {
  const { error } = await supabaseAdmin
    .from("message_drafts")
    .update({ scheduled_for: retryAt.toISOString() } as never)
    .eq("id", draftId);
  if (error) throw error;
}

// ---------- time math ----------

function addMinutes(d: Date, m: number): Date {
  return new Date(d.getTime() + m * 60 * 1000);
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function startOfTomorrow(now: Date): Date {
  const t = new Date(now);
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 1);
  return t;
}

function nextDispatchAfter(
  now: Date,
  blockReason: "quiet_hours" | "sunday_morning" | "chinese_new_year",
  s: AgentMessageSettingsEffective,
): Date {
  if (blockReason === "sunday_morning") {
    // Sunday noon.
    const t = new Date(now);
    t.setHours(12, 0, 0, 0);
    return t;
  }
  if (blockReason === "chinese_new_year") {
    // Try again tomorrow — cheaper than computing CNY end precisely.
    return addDays(now, 1);
  }
  // Quiet hours — next occurrence of quiet_hours_end.
  const [h, m] = s.quietHoursEnd.split(":").map(Number);
  const t = new Date(now);
  t.setHours(h, m, 0, 0);
  if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
  return t;
}

export type { MessageDraft };
