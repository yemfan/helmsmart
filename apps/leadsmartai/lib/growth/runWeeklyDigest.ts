import "server-only";

import { isAnthropicConfigured } from "@/lib/anthropic";
import { sendEmail } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getOpportunities } from "./opportunitiesService";
import { renderGrowthDigestEmail, selectTopOpportunities } from "./renderDigestEmail";

/**
 * Weekly Growth & Opportunities digest.
 *
 * Runs every Monday morning. Per-agent flow:
 *   1. Dedupe — try to INSERT into growth_digest_log for today. If it
 *      conflicts, another invocation already ran; skip.
 *   2. Preference check — skip if growth_digest_enabled=false.
 *   3. Activity gate — skip unless the agent has at least one active
 *      deal signal (active transaction / offer / showing in last 30
 *      days). No point spending a Claude call on a dormant account.
 *   4. Generate opportunities via the existing service (cache-respecting).
 *   5. Pick top 3; if <2, skip to avoid noise emails.
 *   6. Resolve email via auth.admin.getUserById.
 *   7. Send email, stamp log row.
 *
 * Failure modes all degrade safely:
 *   - Anthropic down / out of credits → skipped_reason logged, no email.
 *   - No email on file → skipped_reason logged.
 *   - sendEmail fails → error logged, email_sent stays false.
 */

export type RunWeeklyDigestResult = {
  processedAgents: number;
  sentEmails: number;
  skippedInactive: number;
  skippedPreference: number;
  skippedAlreadySent: number;
  skippedNoEmail: number;
  skippedNoOpportunities: number;
  skippedAiUnavailable: number;
  failed: number;
};

export async function runWeeklyGrowthDigest(opts: {
  todayIso?: string;
  /** Optional cap for testing or gradual rollout. */
  limit?: number;
  appBaseUrl?: string;
}): Promise<RunWeeklyDigestResult> {
  const todayIso = opts.todayIso ?? new Date().toISOString().slice(0, 10);
  const appBaseUrl =
    opts.appBaseUrl ??
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://www.realtybossai.com";

  const result: RunWeeklyDigestResult = {
    processedAgents: 0,
    sentEmails: 0,
    skippedInactive: 0,
    skippedPreference: 0,
    skippedAlreadySent: 0,
    skippedNoEmail: 0,
    skippedNoOpportunities: 0,
    skippedAiUnavailable: 0,
    failed: 0,
  };

  if (!isAnthropicConfigured()) {
    // Bail early. Don't log a row — we never even tried per-agent.
    return result;
  }

  const activeAgentIds = await findActiveAgents();
  if (!activeAgentIds.length) return result;
  const capped =
    opts.limit && opts.limit > 0 ? activeAgentIds.slice(0, opts.limit) : activeAgentIds;

  for (const agentId of capped) {
    result.processedAgents += 1;
    try {
      // Dedupe first. If the INSERT conflicts, skip without doing any
      // expensive downstream work.
      const { data: logRow, error: logErr } = await supabaseAdmin
        .from("growth_digest_log")
        .insert({ agent_id: agentId, digest_date: todayIso })
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
      const { data: prefRow } = await supabaseAdmin
        .from("agent_notification_preferences")
        .select("growth_digest_enabled")
        .eq("agent_id", agentId)
        .maybeSingle();
      const enabled =
        (prefRow as { growth_digest_enabled: boolean | null } | null)?.growth_digest_enabled ?? true;
      if (!enabled) {
        result.skippedPreference += 1;
        if (logId) await stampLog(logId, { skipped_reason: "opt-out" });
        continue;
      }

      // Generate opportunities. The service handles the 1h cache — if
      // the agent has visited the page in the last hour, we reuse. On
      // Monday 7am that's almost never the case, so most of these are
      // fresh generations. Claude cost roughly = $0.05 * active_agents.
      let opps;
      try {
        const generated = await getOpportunities(agentId, { forceRefresh: false });
        if (!generated.aiConfigured) {
          result.skippedAiUnavailable += 1;
          if (logId) await stampLog(logId, { skipped_reason: "ai-not-configured" });
          continue;
        }
        opps = generated.opportunities;
      } catch (err) {
        result.skippedAiUnavailable += 1;
        const message = err instanceof Error ? err.message : "unknown";
        if (logId) await stampLog(logId, { skipped_reason: `ai-error: ${message.slice(0, 300)}` });
        continue;
      }

      const top = selectTopOpportunities(opps, 3);
      if (top.length < 2) {
        // Don't spam; wait for the agent to have a real week.
        result.skippedNoOpportunities += 1;
        if (logId)
          await stampLog(logId, {
            skipped_reason: "not-enough-opportunities",
            opportunity_count: top.length,
          });
        continue;
      }

      // Resolve email.
      const { data: agentRow } = await supabaseAdmin
        .from("agents")
        .select("id, auth_user_id, first_name")
        .eq("id", agentId)
        .maybeSingle();
      const agent = agentRow as {
        id: string | number;
        auth_user_id: string | null;
        first_name?: string | null;
      } | null;
      if (!agent?.auth_user_id) {
        result.skippedNoEmail += 1;
        if (logId) await stampLog(logId, { skipped_reason: "no-auth-user" });
        continue;
      }
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(
        String(agent.auth_user_id),
      );
      const email = authUser?.user?.email ?? null;
      if (!email) {
        result.skippedNoEmail += 1;
        if (logId) await stampLog(logId, { skipped_reason: "no-email" });
        continue;
      }

      const { subject, html, text } = renderGrowthDigestEmail({
        opportunities: top,
        appBaseUrl,
        agentFirstName: agent.first_name ?? null,
      });

      await sendEmail({ to: email, subject, text, html });

      result.sentEmails += 1;
      if (logId)
        await stampLog(logId, { email_sent: true, opportunity_count: top.length });
    } catch (err) {
      result.failed += 1;
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[growth.weekly-digest] agent=${agentId}:`, message);
      try {
        await supabaseAdmin
          .from("growth_digest_log")
          .update({ error: message.slice(0, 500) })
          .eq("agent_id", agentId)
          .eq("digest_date", todayIso);
      } catch {
        // best-effort
      }
    }
  }

  return result;
}

async function stampLog(
  logId: string,
  patch: {
    email_sent?: boolean;
    skipped_reason?: string;
    opportunity_count?: number;
    error?: string;
  },
): Promise<void> {
  try {
    await supabaseAdmin.from("growth_digest_log").update(patch).eq("id", logId);
  } catch {
    // best-effort
  }
}

/**
 * An agent counts as "active" — worth spending Claude credits on — when
 * they have at least one signal of recent deal flow. Union across:
 * active transactions, active offers, showings in the last 30 days.
 *
 * Returned as a deduped list of agent_ids.
 */
async function findActiveAgents(): Promise<string[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const ids = new Set<string>();

  const { data: tx } = await supabaseAdmin
    .from("transactions")
    .select("agent_id")
    .in("status", ["active", "pending"]);
  for (const r of (tx ?? []) as Array<{ agent_id: unknown }>) {
    ids.add(String(r.agent_id));
  }

  const { data: offers } = await supabaseAdmin
    .from("offers")
    .select("agent_id")
    .in("status", ["draft", "submitted", "countered"]);
  for (const r of (offers ?? []) as Array<{ agent_id: unknown }>) {
    ids.add(String(r.agent_id));
  }

  const { data: showings } = await supabaseAdmin
    .from("showings")
    .select("agent_id")
    .gte("scheduled_at", thirtyDaysAgo);
  for (const r of (showings ?? []) as Array<{ agent_id: unknown }>) {
    ids.add(String(r.agent_id));
  }

  return [...ids].filter(Boolean);
}
