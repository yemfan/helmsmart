import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { logAssistantActivity } from "@/lib/closeboss/activities";
import { buildAgentDigest, renderDigestEmail } from "./overdueDigest";
import type { TransactionRow, TransactionTaskRow } from "./types";

/**
 * Orchestrates the daily overdue-task nudge run.
 *
 * Called from `/api/cron/transactions-overdue-nudges` (daily) and
 * manually via the same endpoint with `?secret=` for testing.
 *
 * Flow per agent:
 *   1. Try to INSERT a row into `transaction_nudge_log` for (agent, today).
 *      If that conflicts, another invocation already handled them — skip.
 *   2. Pull their active transactions + incomplete tasks.
 *   3. Hand the raw rows to the pure `buildAgentDigest` so we can unit-test
 *      the bucketing/sorting logic without mocking the DB.
 *   4. Skip if the digest has 0 tasks (common case — most days most agents
 *      have nothing pending). We still leave the dedupe row in place so
 *      retries don't re-scan.
 *   5. Render HTML+text, fire `sendEmail`, update the log row with counts
 *      + email_sent=true. Errors are swallowed per-agent so one bad
 *      auth_user_id doesn't halt the batch.
 *
 * Returned counts are what the cron response surfaces — useful for
 * monitoring (Vercel log drains) and smoke tests.
 */

type AgentRow = { id: string | number; auth_user_id: string | null; first_name?: string | null };

export type RunOverdueNudgesResult = {
  processedAgents: number;
  sentEmails: number;
  skippedNothingToSend: number;
  skippedAlreadySent: number;
  skippedNoEmail: number;
  skippedPreference: number;
  failed: number;
};

export async function runOverdueNudges(opts: {
  /** ISO date — defaults to today in UTC. Tests + manual re-runs can override. */
  todayIso?: string;
  /** Override app base URL for generated email links. */
  appBaseUrl?: string;
  /** Cap the batch; useful during migrations. 0 means "all agents". */
  limit?: number;
}): Promise<RunOverdueNudgesResult> {
  const todayIso = opts.todayIso ?? new Date().toISOString().slice(0, 10);
  const appBaseUrl =
    opts.appBaseUrl ??
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://www.closebossai.com";

  const result: RunOverdueNudgesResult = {
    processedAgents: 0,
    sentEmails: 0,
    skippedNothingToSend: 0,
    skippedAlreadySent: 0,
    skippedNoEmail: 0,
    skippedPreference: 0,
    failed: 0,
  };

  // Weekly subscribers only receive on Mondays. todayIso is YYYY-MM-DD;
  // parse as UTC and check the weekday. Monday = 1 per ISO convention.
  const weekday = new Date(`${todayIso}T00:00:00Z`).getUTCDay();
  const isMonday = weekday === 1;

  // Only iterate agents who actually have an active transaction. Avoids
  // scanning the agents table when the coordinator feature hasn't been
  // adopted yet, and keeps the batch small.
  const { data: activeTxRows, error: txListErr } = await supabaseAdmin
    .from("transactions")
    .select("agent_id")
    .eq("status", "active");
  if (txListErr) throw txListErr;

  const agentIds = [
    ...new Set(
      (activeTxRows ?? [])
        .map((r) => String((r as { agent_id: unknown }).agent_id))
        .filter(Boolean),
    ),
  ];
  if (agentIds.length === 0) return result;

  const capped = opts.limit && opts.limit > 0 ? agentIds.slice(0, opts.limit) : agentIds;

  for (const agentId of capped) {
    result.processedAgents += 1;
    try {
      // Respect per-agent digest preference before we write a log row.
      // Row might not exist (agent hasn't hit Settings yet) — treat that
      // as "daily enabled" per column default.
      const { data: prefRow } = await supabaseAdmin
        .from("agent_notification_preferences")
        .select("transaction_digest_enabled, transaction_digest_frequency")
        .eq("agent_id", agentId)
        .maybeSingle();
      const pref = (prefRow as {
        transaction_digest_enabled: boolean | null;
        transaction_digest_frequency: string | null;
      } | null) ?? null;
      const enabled = pref?.transaction_digest_enabled ?? true;
      const frequency = pref?.transaction_digest_frequency ?? "daily";
      if (!enabled || frequency === "off") {
        result.skippedPreference += 1;
        continue;
      }
      if (frequency === "weekly" && !isMonday) {
        result.skippedPreference += 1;
        continue;
      }

      // Dedupe: INSERT first, detect conflict.
      const { data: logInsertData, error: logInsertErr } = await supabaseAdmin
        .from("transaction_nudge_log")
        .insert({
          agent_id: agentId,
          digest_date: todayIso,
        })
        .select("id")
        .maybeSingle();
      if (logInsertErr) {
        const code = (logInsertErr as { code?: string }).code;
        if (code === "23505") {
          result.skippedAlreadySent += 1;
          continue;
        }
        throw logInsertErr;
      }
      const logId = (logInsertData as { id: string } | null)?.id ?? null;

      // Fetch this agent's active transactions + incomplete tasks.
      const { data: txRows, error: txErr } = await supabaseAdmin
        .from("transactions")
        .select("*")
        .eq("agent_id", agentId)
        .eq("status", "active");
      if (txErr) throw txErr;
      const transactions = (txRows ?? []) as TransactionRow[];
      if (transactions.length === 0) {
        result.skippedNothingToSend += 1;
        continue;
      }

      const txIds = transactions.map((t) => t.id);
      const { data: taskRows, error: taskErr } = await supabaseAdmin
        .from("transaction_tasks")
        .select("*")
        .in("transaction_id", txIds as never)
        .is("completed_at", null);
      if (taskErr) throw taskErr;
      const tasks = (taskRows ?? []) as TransactionTaskRow[];

      // Join contact name for the digest header.
      const contactIds = [...new Set(transactions.map((t) => t.contact_id))];
      const { data: contactRows } = await supabaseAdmin
        .from("contacts")
        .select("id, first_name, last_name, email")
        .in("id", contactIds as never);
      const contactNameById = new Map<string, string | null>();
      for (const c of (contactRows ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>) {
        const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email || null;
        contactNameById.set(String(c.id), name);
      }

      const digest = buildAgentDigest({
        todayIso,
        transactions: transactions.map((t) => ({
          ...t,
          contact_name: contactNameById.get(t.contact_id) ?? null,
        })),
        tasks,
      });

      if (digest.taskCount === 0) {
        result.skippedNothingToSend += 1;
        if (logId) {
          await supabaseAdmin
            .from("transaction_nudge_log")
            .update({
              task_count: 0,
              overdue_count: 0,
              upcoming_count: 0,
              email_sent: false,
            })
            .eq("id", logId);
        }
        continue;
      }

      // Resolve agent email via auth.admin.
      const { data: agentRows } = await supabaseAdmin
        .from("agents")
        .select("id, auth_user_id, first_name")
        .eq("id", agentId)
        .maybeSingle();
      const agent = agentRows as AgentRow | null;
      if (!agent?.auth_user_id) {
        result.skippedNoEmail += 1;
        continue;
      }

      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.getUserById(
        String(agent.auth_user_id),
      );
      if (authErr || !authUser?.user?.email) {
        result.skippedNoEmail += 1;
        continue;
      }

      const { subject, html, text } = renderDigestEmail(digest, {
        appBaseUrl,
        agentFirstName: agent.first_name ?? null,
      });

      await sendEmail({
        to: authUser.user.email,
        subject,
        text,
        html,
      });

      result.sentEmails += 1;

      // CloseBoss activity feed — fire-and-forget, never fails the run.
      void logAssistantActivity({
        agentId,
        assistantType: "transaction_assistant",
        activityType: "transaction_digest",
        summary: `Emailed your transaction digest: ${digest.overdueCount} overdue, ${digest.upcomingCount} upcoming task${digest.upcomingCount === 1 ? "" : "s"}`,
        outcome: "Digest sent",
        priority: digest.overdueCount > 0 ? "high" : "normal",
        requiresAttention: digest.overdueCount > 0,
      });

      if (logId) {
        await supabaseAdmin
          .from("transaction_nudge_log")
          .update({
            task_count: digest.taskCount,
            overdue_count: digest.overdueCount,
            upcoming_count: digest.upcomingCount,
            email_sent: true,
          })
          .eq("id", logId);
      }
    } catch (err) {
      result.failed += 1;
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[overdue-nudges] agent=${agentId}:`, message);
      // Best-effort: record the error on the log row if one got inserted.
      try {
        await supabaseAdmin
          .from("transaction_nudge_log")
          .update({ error: message.slice(0, 500) })
          .eq("agent_id", agentId)
          .eq("digest_date", todayIso);
      } catch {
        // nothing to do — we already logged above
      }
    }
  }

  return result;
}
