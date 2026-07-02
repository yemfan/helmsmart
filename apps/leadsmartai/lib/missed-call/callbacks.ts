import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getOrInitSettings, toE164 } from "@/lib/missed-call/service";
import { logAssistantActivity } from "@/lib/realtyboss/activities";

const MS_DAY = 24 * 60 * 60_000;

/**
 * Missed-call auto call-back ladder.
 *
 * When the Receptionist logs a missed call (and the caller isn't a
 * personal contact), a `receptionist_callbacks` row schedules outbound
 * AI call-backs whose cadence is configured per agent in
 * `missed_call_settings` (Receptionist → Voice settings → Missed call):
 * retry every `callback_interval_minutes`, up to `callback_max_per_day`
 * attempts a day, for `callback_max_days` days. The cron
 * (/api/cron/receptionist-callbacks, every 5 minutes) places due
 * attempts via the same Retell outbound path the voice console uses.
 * The ladder resolves the moment ANY call with that caller connects —
 * they answer a call-back, or they call again and the AI answers. When
 * the configured attempts run out without reaching them, an open
 * "call back" crm_tasks row is created so the Realtor can do it manually.
 */

export type CallbackRow = {
  id: string;
  agent_id: unknown;
  contact_id: string | null;
  call_log_id: string | null;
  phone_e164: string;
  attempts: number;
  next_attempt_at: string | null;
  status: "scheduled" | "answered" | "exhausted" | "cancelled";
  last_provider_call_id: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Start (or no-op into) a call-back ladder for a missed call. The
 * partial unique index on (agent_id, phone_e164) where scheduled
 * guarantees one active ladder per caller — a second miss while one
 * is running just keeps the existing schedule. Best-effort: never
 * throws, a scheduling failure must not fail the text-back flow.
 */
export async function scheduleCallBacks(args: {
  agentId: string;
  callerPhone: string;
  contactId: string | null;
  callLogId: string | null;
}): Promise<{ scheduled: boolean }> {
  const phone = toE164(args.callerPhone);
  if (!phone) return { scheduled: false };

  try {
    // The agent can switch the auto call-back ladder off while keeping
    // the text-back on — respect that here so no ladder is created.
    const settings = await getOrInitSettings(args.agentId);
    if (!settings.callback_enabled) return { scheduled: false };

    // Auto call-backs are for LEADS only. A known contact who's part of the
    // sphere, an existing/past client, or a referral source (i.e. friends &
    // family and relationships) should NOT get a relentless AI call-back
    // ladder — the Realtor calls them back personally. Unknown callers (no
    // contact yet) are treated as potential new leads and still get the ladder.
    if (args.contactId) {
      const { data: c } = await supabaseAdmin
        .from("contacts")
        .select("lifecycle_stage")
        .eq("id", args.contactId)
        .maybeSingle();
      const stage = (c as { lifecycle_stage?: string | null } | null)?.lifecycle_stage ?? null;
      const NON_LEAD_STAGES = new Set([
        "active_client",
        "past_client",
        "sphere",
        "referral_source",
        "archived",
      ]);
      if (stage && NON_LEAD_STAGES.has(stage)) return { scheduled: false };
    }

    const firstAttemptAt = new Date(
      Date.now() + settings.callback_interval_minutes * 60_000,
    ).toISOString();
    const { error } = await supabaseAdmin
      .from("receptionist_callbacks")
      .insert({
        agent_id: args.agentId,
        contact_id: args.contactId,
        call_log_id: args.callLogId,
        phone_e164: phone,
        attempts: 0,
        next_attempt_at: firstAttemptAt,
        status: "scheduled",
      });
    if (error) {
      // 23505 = an active ladder already exists for this caller. Expected.
      if (error.code !== "23505") {
        console.error("[callbacks] schedule failed:", error.message);
      }
      return { scheduled: false };
    }
    return { scheduled: true };
  } catch (e) {
    console.error("[callbacks] schedule threw:", e);
    return { scheduled: false };
  }
}

/**
 * Resolve any active ladder for this caller — called from the Retell
 * call-events webhook whenever a call with them CONNECTS, in either
 * direction. Also flips a freshly-exhausted ladder to answered when
 * the final attempt is the one that connects. Best-effort.
 */
export async function resolveCallBacksForPhone(args: {
  agentId: string;
  phone: string;
}): Promise<void> {
  const phone = toE164(args.phone);
  if (!phone) return;
  try {
    await supabaseAdmin
      .from("receptionist_callbacks")
      .update({ status: "answered", updated_at: new Date().toISOString() })
      .eq("agent_id", args.agentId)
      .eq("phone_e164", phone)
      .in("status", ["scheduled", "exhausted"]);
  } catch (e) {
    console.error("[callbacks] resolve threw:", e);
  }
}

/**
 * Place every due call-back. Runs from the every-5-minutes cron. Each row:
 * place the outbound AI call, bump the attempt counter, and either
 * schedule the next rung (next attempt is `callback_interval_minutes`
 * out within a day, or the next day once the daily cap is hit) or
 * exhaust the ladder once `max_per_day × max_days` attempts are spent —
 * which also opens a manual "call back" task for the Realtor.
 *
 * Dynamic imports keep the Retell voice stack out of the module
 * graph of everything that merely schedules/resolves ladders.
 */
export async function processDueCallBacks(limit = 25): Promise<{
  due: number;
  placed: number;
  exhausted: number;
  errors: number;
}> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("receptionist_callbacks")
    .select(
      "id, agent_id, contact_id, call_log_id, phone_e164, attempts, next_attempt_at, status, last_provider_call_id, created_at, updated_at",
    )
    .eq("status", "scheduled")
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[callbacks] due query failed:", error.message);
    return { due: 0, placed: 0, exhausted: 0, errors: 1 };
  }

  const rows = (data ?? []) as CallbackRow[];
  if (rows.length === 0) return { due: 0, placed: 0, exhausted: 0, errors: 0 };

  const [{ placeOutboundCall }, { loadReceptionistContext }, svc] =
    await Promise.all([
      import("@/lib/voice-agent/outbound"),
      import("@/lib/voice-agent/context"),
      import("@/lib/missed-call/service"),
    ]);

  let placed = 0;
  let exhausted = 0;
  let errors = 0;

  for (const row of rows) {
    const agentId = String(row.agent_id);
    const attemptNumber = row.attempts + 1;
    try {
      // The same toggle that powers the text-back governs the ladder;
      // the voice receptionist must also be enabled (no Retell config
      // → no outbound voice to call back with).
      const settings = await svc.getOrInitSettings(agentId);
      const ctx = settings.enabled ? await loadReceptionistContext(agentId) : null;
      if (!ctx) {
        await supabaseAdmin
          .from("receptionist_callbacks")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", row.id);
        continue;
      }

      // Per-agent cadence. Total attempts = per-day × days.
      const perDay = Math.max(1, settings.callback_max_per_day);
      const maxDays = Math.max(1, settings.callback_max_days);
      const intervalMin = Math.max(5, settings.callback_interval_minutes);
      const totalAttempts = perDay * maxDays;

      const contact = await svc.findContactByPhone(agentId, row.phone_e164);
      const leadName = contact?.name?.trim() || "the caller";

      const { callId } = await placeOutboundCall({
        ctx,
        agentId,
        leadName,
        toNumberE164: row.phone_e164,
        purpose: "follow_up",
        detail: `They called earlier and we missed them — this is call-back attempt ${attemptNumber} of ${totalAttempts}. Apologize briefly for missing their call and ask how you can help.`,
      });
      placed += 1;

      const isLastAttempt = attemptNumber >= totalAttempts;
      // Within a day, the next attempt is `intervalMin` out; once the
      // day's quota is spent, resume the next day.
      const finishedDayQuota = attemptNumber % perDay === 0;
      const nextAttemptAt = isLastAttempt
        ? null
        : new Date(
            Date.now() + (finishedDayQuota ? MS_DAY : intervalMin * 60_000),
          ).toISOString();
      await supabaseAdmin
        .from("receptionist_callbacks")
        .update({
          attempts: attemptNumber,
          last_provider_call_id: callId,
          status: isLastAttempt ? "exhausted" : "scheduled",
          next_attempt_at: nextAttemptAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (isLastAttempt) exhausted += 1;

      // Tag the call_logs row the placement wrote so the call list
      // reads as a call-back, not a generic outbound call.
      await supabaseAdmin
        .from("call_logs")
        .update({
          notes: `Automatic call-back (attempt ${attemptNumber} of ${totalAttempts}) for a missed call.`,
        })
        .eq("twilio_call_sid", callId);

      // Exhausted without reaching them → hand it to the Realtor as a task.
      if (isLastAttempt) {
        await createManualCallBackTask({
          agentId,
          contactId: row.contact_id,
          phoneE164: row.phone_e164,
          leadName: contact?.name?.trim() || row.phone_e164,
          attempts: attemptNumber,
        });
      }

      void logAssistantActivity({
        agentId,
        assistantType: "receptionist",
        activityType: "missed_call_callback",
        summary: `Called ${leadName} back (attempt ${attemptNumber} of ${totalAttempts})`,
        outcome: isLastAttempt
          ? "Couldn't reach them — added a task to call back manually"
          : "Will retry if unanswered",
        priority: isLastAttempt ? "high" : "normal",
        requiresAttention: isLastAttempt,
        relatedEntityType: row.contact_id ? "contact" : null,
        relatedEntityId: row.contact_id,
      });
    } catch (e) {
      errors += 1;
      console.error(`[callbacks] attempt failed for ${row.id}:`, e);
      // Push the rung 10 minutes out rather than hot-looping the failure.
      await supabaseAdmin
        .from("receptionist_callbacks")
        .update({
          next_attempt_at: new Date(Date.now() + 10 * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("status", "scheduled");
    }
  }

  return { due: rows.length, placed, exhausted, errors };
}

/**
 * Open a manual "call back" task once the AI ladder is exhausted without
 * reaching the caller. Deduped on the originating phone so a fresh ladder
 * for the same number won't pile up duplicate open tasks. Best-effort —
 * a task-write failure must not break the cron run.
 */
async function createManualCallBackTask(args: {
  agentId: string;
  contactId: string | null;
  phoneE164: string;
  leadName: string;
  attempts: number;
}): Promise<void> {
  try {
    const { data: existing } = await supabaseAdmin
      .from("crm_tasks")
      .select("id")
      .eq("agent_id", args.agentId as never)
      .eq("task_type", "missed_call_callback")
      .in("status", ["open", "in_progress"])
      .contains("metadata_json", { phone_e164: args.phoneE164 } as Record<string, unknown>)
      .maybeSingle();
    if (existing) return;

    await supabaseAdmin.from("crm_tasks").insert({
      agent_id: args.agentId as never,
      contact_id: args.contactId as never,
      title: `Call ${args.leadName} back — AI couldn't reach them`,
      description: `Your AI Receptionist placed ${args.attempts} automatic call-back${
        args.attempts === 1 ? "" : "s"
      } to ${args.phoneE164} after a missed call without reaching them. Give them a call when you have a minute.`,
      status: "open",
      priority: "high",
      task_type: "missed_call_callback",
      source: "ai_call",
      due_at: new Date().toISOString(),
      metadata_json: {
        phone_e164: args.phoneE164,
        reason: "callback_exhausted",
        attempts: args.attempts,
      },
    } as never);
  } catch (e) {
    console.error("[callbacks] manual call-back task failed:", e);
  }
}
