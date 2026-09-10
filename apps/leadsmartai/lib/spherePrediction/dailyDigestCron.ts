import "server-only";

import { loadAgentDisplayIdentity } from "@/lib/agents/displayIdentity.server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSMS } from "@/lib/twilioSms";

import {
  buildDigestSms,
  DEDUP_DAYS,
  pickNewHighCandidates,
} from "@/lib/spherePrediction/digestFormat";
import { shouldRunDigestForAgentToday } from "@/lib/spherePrediction/digestCadence";
import {
  topLikelySellersForAgent,
  type LikelySellerRow,
} from "@/lib/spherePrediction/service";

// Re-export for callers (tests, other lib code) that already imported from here.
export { DEDUP_DAYS, DIGEST_TOP_N, buildDigestSms, pickNewHighCandidates } from "@/lib/spherePrediction/digestFormat";

/**
 * Daily SOI seller-digest cron. For each agent, surface contacts that
 * (1) score `high` likelihood today AND (2) haven't been notified within
 * the last DEDUP_DAYS window. Send one summary SMS per agent — not one
 * per candidate — so the agent gets a single morning digest, not a barrage.
 *
 * Dedup is event-driven, not score-driven: the cron writes a
 * `sphere_seller_high_notified` row in `contact_events` for every contact
 * it pages on. Subsequent runs read those events and skip contacts that
 * appeared in the window. A contact who keeps scoring high will surface
 * again ~30 days after the last notification, matching standard SOI
 * farming cadence (you're not pestering them daily).
 *
 * Failure isolation: per-agent errors are caught and logged so one bad
 * agent (e.g. missing phone) does not block the cron for everyone else.
 *
 * Pure formatters live in `digestFormat.ts` (no `server-only` import) so
 * they can be tested without spinning up the supabase / twilio shims.
 */

type AgentNotifyContact = {
  agentId: string;
  authUserId: string | null;
  firstName: string | null;
  agentPhone: string | null;
};

async function fetchAgentNotifyContact(agentId: string): Promise<AgentNotifyContact | null> {
  // Name lives on user_profiles, not agents; the SMS goes to the agent's
  // own mobile on the profile.
  const a = await loadAgentDisplayIdentity(agentId);
  if (!a) return null;
  return { agentId: a.agentId, authUserId: a.authUserId, firstName: a.firstName, agentPhone: a.profilePhone };
}

function toE164(phone: string): string | null {
  const d = phone.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `+1${d}` : null;
}

async function fetchAlreadyNotifiedIds(
  agentId: string,
  windowDays: number,
): Promise<Set<string>> {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const { data } = await supabaseAdmin
    .from("contact_events")
    .select("contact_id")
    .eq("agent_id", agentId)
    .eq("event_type", "sphere_seller_high_notified")
    .gte("created_at", since);
  const out = new Set<string>();
  for (const row of (data ?? []) as Array<{ contact_id: string }>) {
    out.add(String(row.contact_id));
  }
  return out;
}

async function recordNotifications(
  agentId: string,
  candidates: ReadonlyArray<LikelySellerRow>,
): Promise<void> {
  if (candidates.length === 0) return;
  const rows = candidates.map((c) => ({
    contact_id: c.contactId,
    agent_id: agentId,
    event_type: "sphere_seller_high_notified",
    metadata: {
      score: c.score,
      label: c.label,
      top_reason: c.topReason,
    },
    source: "sphere_seller_digest_cron",
  }));
  const { error } = await supabaseAdmin
    .from("contact_events")
    .insert(rows as Record<string, unknown>[]);
  if (error) {
    console.warn("[sphere-digest-cron] contact_events insert failed", error.message);
  }
}

export type AgentDigestResult =
  | { agentId: string; sent: true; candidateCount: number; messagePreview: string }
  | { agentId: string; sent: false; reason: string; candidateCount?: number };

export async function runSphereSellerDigestForAgent(
  agentId: string,
  opts: { dryRun?: boolean; limit?: number } = {},
): Promise<AgentDigestResult> {
  const limit = opts.limit ?? 50;

  // Per-agent cadence gate (env-driven, no schema). Skip agents who opted
  // out (`SPHERE_DIGEST_OFF_AGENT_IDS`) or chose weekly cadence on a non-
  // Monday. The dryRun + agentId-override paths in the cron route still
  // honor cadence so manual testing reflects what production will do —
  // pass `?agentId=<id>` to test a specific agent's flow on the right day.
  if (
    !shouldRunDigestForAgentToday(
      agentId,
      {
        SPHERE_DIGEST_WEEKLY_AGENT_IDS: process.env.SPHERE_DIGEST_WEEKLY_AGENT_IDS,
        SPHERE_DIGEST_OFF_AGENT_IDS: process.env.SPHERE_DIGEST_OFF_AGENT_IDS,
      },
      new Date(),
    )
  ) {
    return { agentId, sent: false, reason: "cadence_skip" };
  }

  const ranked = await topLikelySellersForAgent(agentId, { limit, label: "high" });
  if (ranked.length === 0) {
    return { agentId, sent: false, reason: "no_high_candidates", candidateCount: 0 };
  }

  const alreadyIds = await fetchAlreadyNotifiedIds(agentId, DEDUP_DAYS);
  const newCandidates = pickNewHighCandidates(ranked, alreadyIds);
  if (newCandidates.length === 0) {
    return { agentId, sent: false, reason: "all_already_notified", candidateCount: 0 };
  }

  const contact = await fetchAgentNotifyContact(agentId);
  if (!contact) {
    return { agentId, sent: false, reason: "agent_not_found" };
  }

  const body = buildDigestSms(newCandidates, contact.firstName);
  if (!body) {
    return { agentId, sent: false, reason: "empty_body" };
  }

  if (opts.dryRun) {
    return {
      agentId,
      sent: true,
      candidateCount: newCandidates.length,
      messagePreview: body,
    };
  }

  if (!contact.agentPhone) {
    return { agentId, sent: false, reason: "agent_no_phone", candidateCount: newCandidates.length };
  }
  const to = toE164(contact.agentPhone);
  if (!to) {
    return { agentId, sent: false, reason: "agent_phone_invalid", candidateCount: newCandidates.length };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber) {
    return { agentId, sent: false, reason: "twilio_not_configured", candidateCount: newCandidates.length };
  }

  try {
    // Note: sendSMS expects a contact-side leadId for logging; for an agent-
    // direction broadcast we pass the agentId as the dedup key — unusual but
    // keeps the SMS log queryable by recipient identity.
    await sendSMS(to, body, agentId);
  } catch (e) {
    const reason = e instanceof Error ? e.message : "sms_send_error";
    return { agentId, sent: false, reason: `sms_failed:${reason}`, candidateCount: newCandidates.length };
  }

  await recordNotifications(agentId, newCandidates);

  return {
    agentId,
    sent: true,
    candidateCount: newCandidates.length,
    messagePreview: body,
  };
}

/**
 * Top-level cron entry. Iterates over agents (optionally one specific agent
 * via opts.agentId) and runs the digest. Per-agent failures are isolated.
 */
export async function runSphereSellerDigestForAllAgents(
  opts: { agentId?: string; dryRun?: boolean; limit?: number } = {},
): Promise<{
  totalAgents: number;
  sent: number;
  skipped: number;
  failed: number;
  results: AgentDigestResult[];
}> {
  let agentIds: string[] = [];
  if (opts.agentId) {
    agentIds = [opts.agentId];
  } else {
    const { data } = await supabaseAdmin.from("agents").select("id");
    agentIds = ((data ?? []) as Array<{ id: unknown }>).map((r) => String(r.id));
  }

  const results: AgentDigestResult[] = [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const agentId of agentIds) {
    try {
      const r = await runSphereSellerDigestForAgent(agentId, opts);
      results.push(r);
      if (r.sent) sent++;
      else skipped++;
    } catch (e) {
      failed++;
      const reason = e instanceof Error ? e.message : "unknown";
      results.push({ agentId, sent: false, reason: `error:${reason}` });
      console.warn("[sphere-digest-cron] agent failed", agentId, reason);
    }
  }

  return { totalAgents: agentIds.length, sent, skipped, failed, results };
}
