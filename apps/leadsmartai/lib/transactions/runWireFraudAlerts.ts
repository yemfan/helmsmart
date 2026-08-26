import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSMS } from "@/lib/twilioSms";
import { logAssistantActivity } from "@/lib/closeboss/activities";
import type { TransactionRow, TransactionTaskRow } from "./types";
import { EMAIL_BRAND } from "@/lib/email";

/**
 * Fires an SMS to the buyer's agent 24-48 hours before close, but only
 * if the `verify_wire_instructions` task is still incomplete. This is a
 * fraud-prevention alert, not marketing — wire-redirect scams average
 * $50-200k per incident and the window to intercept is narrow.
 *
 * Why this lives separately from the email digest:
 *
 *   * Different urgency. Email is a 7am daily summary; this is "your
 *     phone rings at 7am because you haven't confirmed wire details and
 *     escrow closes tomorrow."
 *   * Different channel economics. Twilio per-message cost is 100x
 *     email; we only send it when it actually matters.
 *   * Different dedupe scope. Email dedupes per (agent, day). This
 *     dedupes per (transaction, day) — if the agent has three closings
 *     tomorrow, they get three SMSes.
 *
 * Flow per candidate transaction:
 *   1. INSERT dedupe row — if it conflicts, already sent today, skip.
 *   2. Check agent wire_fraud_sms_enabled pref (default true).
 *   3. Resolve agent phone via user_profiles → auth.users.
 *   4. Send SMS via Twilio, mark sms_sent=true on the log row.
 */

export type RunWireFraudAlertsResult = {
  candidates: number;
  sentSms: number;
  skippedAlreadySent: number;
  skippedPreference: number;
  skippedNoPhone: number;
  failed: number;
};

const WIRE_SEED_KEY = "verify_wire_instructions";
// Close today → skip (too late to intercept, agent already knows). Close
// in >2 days → skip (premature). Window is closing_date between today+1
// and today+2 inclusive.
const WINDOW_MIN_DAYS = 1;
const WINDOW_MAX_DAYS = 2;

export async function runWireFraudAlerts(opts: {
  todayIso?: string;
  limit?: number;
}): Promise<RunWireFraudAlertsResult> {
  const todayIso = opts.todayIso ?? new Date().toISOString().slice(0, 10);
  const minIso = addDaysToIso(todayIso, WINDOW_MIN_DAYS);
  const maxIso = addDaysToIso(todayIso, WINDOW_MAX_DAYS);

  const result: RunWireFraudAlertsResult = {
    candidates: 0,
    sentSms: 0,
    skippedAlreadySent: 0,
    skippedPreference: 0,
    skippedNoPhone: 0,
    failed: 0,
  };

  // Pull candidate transactions + their wire tasks in one shot.
  const { data: txRows, error: txErr } = await supabaseAdmin
    .from("transactions")
    .select("id, agent_id, contact_id, property_address, closing_date, closing_date_actual, status")
    .eq("status", "active")
    .gte("closing_date", minIso)
    .lte("closing_date", maxIso);
  if (txErr) throw txErr;
  const txs = (txRows ?? []) as Array<
    Pick<
      TransactionRow,
      "id" | "agent_id" | "contact_id" | "property_address" | "closing_date" | "closing_date_actual" | "status"
    >
  >;
  if (!txs.length) return result;

  // Filter to those with an incomplete wire-verification task.
  const { data: taskRows } = await supabaseAdmin
    .from("transaction_tasks")
    .select("transaction_id, seed_key, completed_at")
    .in("transaction_id", txs.map((t) => t.id) as never)
    .eq("seed_key", WIRE_SEED_KEY)
    .is("completed_at", null);
  const txIdsWithOpenWireTask = new Set(
    ((taskRows ?? []) as Array<Pick<TransactionTaskRow, "transaction_id">>).map(
      (t) => t.transaction_id,
    ),
  );
  const candidates = txs.filter((t) => txIdsWithOpenWireTask.has(t.id));
  result.candidates = candidates.length;

  const capped = opts.limit && opts.limit > 0 ? candidates.slice(0, opts.limit) : candidates;

  for (const tx of capped) {
    try {
      const daysToClose = daysBetweenIso(todayIso, tx.closing_date!);
      // Dedupe: unique(transaction_id, alert_date).
      const { data: logRow, error: logErr } = await supabaseAdmin
        .from("transaction_wire_alert_log")
        .insert({
          agent_id: tx.agent_id,
          transaction_id: tx.id,
          alert_date: todayIso,
          days_to_close: daysToClose,
        })
        .select("id")
        .maybeSingle();
      if (logErr) {
        const code = (logErr as { code?: string }).code;
        if (code === "23505") {
          result.skippedAlreadySent += 1;
          continue;
        }
        throw logErr;
      }
      const logId = (logRow as { id: string } | null)?.id ?? null;

      // Preference check.
      const { data: pref } = await supabaseAdmin
        .from("agent_notification_preferences")
        .select("wire_fraud_sms_enabled")
        .eq("agent_id", tx.agent_id)
        .maybeSingle();
      const enabled = (pref as { wire_fraud_sms_enabled: boolean | null } | null)?.wire_fraud_sms_enabled ?? true;
      if (!enabled) {
        result.skippedPreference += 1;
        if (logId) {
          await supabaseAdmin
            .from("transaction_wire_alert_log")
            .update({ error: "opt-out" })
            .eq("id", logId);
        }
        continue;
      }

      const phone = await resolveAgentPhone(String(tx.agent_id));
      if (!phone) {
        result.skippedNoPhone += 1;
        if (logId) {
          await supabaseAdmin
            .from("transaction_wire_alert_log")
            .update({ error: "no agent phone on file" })
            .eq("id", logId);
        }
        continue;
      }

      const message = buildWireFraudSms({
        propertyAddress: tx.property_address,
        closingDate: tx.closing_date!,
        daysToClose,
      });

      await sendSMS(phone, message);

      result.sentSms += 1;

      // CloseBoss activity feed — fire-and-forget, never fails the run.
      void logAssistantActivity({
        agentId: String(tx.agent_id),
        assistantType: "transaction_assistant",
        activityType: "wire_fraud_alert",
        summary: `Texted you a wire-fraud reminder for ${tx.property_address} (closes in ${daysToClose} day${daysToClose === 1 ? "" : "s"}, wire instructions unverified)`,
        outcome: "Alert sent",
        priority: "high",
        requiresAttention: true,
        relatedEntityType: "transaction",
        relatedEntityId: tx.id,
      });
      if (logId) {
        await supabaseAdmin
          .from("transaction_wire_alert_log")
          .update({ sms_sent: true })
          .eq("id", logId);
      }
    } catch (err) {
      result.failed += 1;
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[wire-fraud-alert] tx=${tx.id}:`, message);
      try {
        await supabaseAdmin
          .from("transaction_wire_alert_log")
          .update({ error: message.slice(0, 500) })
          .eq("transaction_id", tx.id)
          .eq("alert_date", todayIso);
      } catch {
        // best-effort
      }
    }
  }

  return result;
}

export function buildWireFraudSms(input: {
  propertyAddress: string;
  closingDate: string;
  daysToClose: number;
}): string {
  const when =
    input.daysToClose === 1 ? "tomorrow" : `in ${input.daysToClose} days`;
  // Keep ≤160 chars when possible (single SMS segment). The warning is
  // the whole point — lose other niceties first.
  return (
    `⚠️ WIRE FRAUD ALERT: ${input.propertyAddress} closes ${when} (${input.closingDate}). ` +
    `VERBALLY verify wire instructions — call title on a KNOWN number. ` +
    `Scammers spoof emails. ${EMAIL_BRAND}.`
  );
}

async function resolveAgentPhone(agentId: string): Promise<string | null> {
  // agents.auth_user_id → user_profiles.phone. Use user_profiles (not
  // auth metadata) because that's where our agent portal writes the
  // phone number on signup.
  const { data: agentRow } = await supabaseAdmin
    .from("agents")
    .select("auth_user_id")
    .eq("id", agentId)
    .maybeSingle();
  const authUserId = (agentRow as { auth_user_id: string | null } | null)?.auth_user_id ?? null;
  if (!authUserId) return null;

  const { data: profile } = await supabaseAdmin
    .from("user_profiles")
    .select("phone")
    .eq("user_id", authUserId)
    .maybeSingle();
  const raw = ((profile as { phone: string | null } | null)?.phone ?? "").trim();
  if (!raw) return null;
  // Twilio wants E.164. Accept already-E.164 values verbatim; convert
  // 10-digit to +1-prefixed for US.
  if (raw.startsWith("+")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

function addDaysToIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((v) => Number(v));
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function daysBetweenIso(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  const from = Date.UTC(fy, (fm ?? 1) - 1, fd ?? 1);
  const to = Date.UTC(ty, (tm ?? 1) - 1, td ?? 1);
  return Math.round((to - from) / 86_400_000);
}
