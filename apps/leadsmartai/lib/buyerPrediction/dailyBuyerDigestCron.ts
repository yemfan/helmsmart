import "server-only";

import { loadAgentDisplayIdentity } from "@/lib/agents/displayIdentity.server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSMS } from "@/lib/twilioSms";

import {
  topLikelyBuyersForAgent,
  type LikelyBuyerRow,
} from "@/lib/buyerPrediction/service";
import {
  buildBuyerDigestSms,
  BUYER_DEDUP_DAYS,
  pickNewHighBuyerCandidates,
} from "@/lib/buyerPrediction/digestFormat";
import { shouldRunDigestForAgentToday } from "@/lib/spherePrediction/digestCadence";

// Re-export for callers (tests, other lib code).
export {
  BUYER_DEDUP_DAYS,
  BUYER_DIGEST_TOP_N,
  buildBuyerDigestSms,
  pickNewHighBuyerCandidates,
} from "@/lib/buyerPrediction/digestFormat";

/**
 * Daily SOI BUYER digest cron — the dual of the seller digest in
 * `lib/spherePrediction/dailyDigestCron`. For each agent, surface
 * past_client + sphere contacts that (1) score `high` likelihood to BUY
 * their next home AND (2) haven't been buyer-notified within
 * BUYER_DEDUP_DAYS.
 *
 * Reuses the existing `shouldRunDigestForAgentToday` gate so a single set
 * of cadence env vars (SPHERE_DIGEST_OFF_AGENT_IDS /
 * SPHERE_DIGEST_WEEKLY_AGENT_IDS) controls both digests in lockstep —
 * agents opting out of the seller digest typically don't want the buyer
 * digest either, and granular per-digest opt-out can come in a follow-up.
 *
 * Dedup is event-driven, scoped by event_type='sphere_buyer_high_notified'
 * so it does NOT collide with the seller digest's
 * 'sphere_seller_high_notified' rows. A contact who scores high in BOTH
 * gets two notifications per dedup window — the agent should hear about
 * each angle separately.
 *
 * Failure isolation: per-agent errors logged, never bubble up so one bad
 * agent does not block the cron for everyone else.
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

async function fetchAlreadyNotifiedBuyerIds(
  agentId: string,
  windowDays: number,
): Promise<Set<string>> {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const { data } = await supabaseAdmin
    .from("contact_events")
    .select("contact_id")
    .eq("agent_id", agentId)
    .eq("event_type", "sphere_buyer_high_notified")
    .gte("created_at", since);
  const out = new Set<string>();
  for (const row of (data ?? []) as Array<{ contact_id: string }>) {
    out.add(String(row.contact_id));
  }
  return out;
}

async function recordBuyerNotifications(
  agentId: string,
  candidates: ReadonlyArray<LikelyBuyerRow>,
): Promise<void> {
  if (candidates.length === 0) return;
  const rows = candidates.map((c) => ({
    contact_id: c.contactId,
    agent_id: agentId,
    event_type: "sphere_buyer_high_notified",
    metadata: {
      score: c.score,
      label: c.label,
      top_reason: c.topReason,
    },
    source: "sphere_buyer_digest_cron",
  }));
  const { error } = await supabaseAdmin
    .from("contact_events")
    .insert(rows as Record<string, unknown>[]);
  if (error) {
    console.warn("[sphere-buyer-digest] contact_events insert failed", error.message);
  }
}

export type AgentBuyerDigestResult =
  | { agentId: string; sent: true; candidateCount: number; messagePreview: string }
  | { agentId: string; sent: false; reason: string; candidateCount?: number };

export async function runBuyerDigestForAgent(
  agentId: string,
  opts: { dryRun?: boolean; limit?: number } = {},
): Promise<AgentBuyerDigestResult> {
  const limit = opts.limit ?? 50;

  // Same cadence gate as the seller digest — env-driven, no schema. Skip
  // agents who opted out (`SPHERE_DIGEST_OFF_AGENT_IDS`) or chose weekly
  // cadence on a non-Monday. Single source of truth keeps the agent's
  // morning experience consistent across both digests.
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

  const ranked = await topLikelyBuyersForAgent(agentId, { limit, label: "high" });
  if (ranked.length === 0) {
    return { agentId, sent: false, reason: "no_high_candidates", candidateCount: 0 };
  }

  const alreadyIds = await fetchAlreadyNotifiedBuyerIds(agentId, BUYER_DEDUP_DAYS);
  const newCandidates = pickNewHighBuyerCandidates(ranked, alreadyIds);
  if (newCandidates.length === 0) {
    return { agentId, sent: false, reason: "all_already_notified", candidateCount: 0 };
  }

  const contact = await fetchAgentNotifyContact(agentId);
  if (!contact) {
    return { agentId, sent: false, reason: "agent_not_found" };
  }

  const body = buildBuyerDigestSms(newCandidates, contact.firstName);
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
    return {
      agentId,
      sent: false,
      reason: "agent_no_phone",
      candidateCount: newCandidates.length,
    };
  }
  const to = toE164(contact.agentPhone);
  if (!to) {
    return {
      agentId,
      sent: false,
      reason: "agent_phone_invalid",
      candidateCount: newCandidates.length,
    };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber) {
    return {
      agentId,
      sent: false,
      reason: "twilio_not_configured",
      candidateCount: newCandidates.length,
    };
  }

  try {
    await sendSMS(to, body, agentId);
  } catch (e) {
    const reason = e instanceof Error ? e.message : "sms_send_error";
    return {
      agentId,
      sent: false,
      reason: `sms_failed:${reason}`,
      candidateCount: newCandidates.length,
    };
  }

  await recordBuyerNotifications(agentId, newCandidates);

  return {
    agentId,
    sent: true,
    candidateCount: newCandidates.length,
    messagePreview: body,
  };
}

export async function runBuyerDigestForAllAgents(
  opts: { agentId?: string; dryRun?: boolean; limit?: number } = {},
): Promise<{
  totalAgents: number;
  sent: number;
  skipped: number;
  failed: number;
  results: AgentBuyerDigestResult[];
}> {
  let agentIds: string[] = [];
  if (opts.agentId) {
    agentIds = [opts.agentId];
  } else {
    const { data } = await supabaseAdmin.from("agents").select("id");
    agentIds = ((data ?? []) as Array<{ id: unknown }>).map((r) => String(r.id));
  }

  const results: AgentBuyerDigestResult[] = [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const agentId of agentIds) {
    try {
      const r = await runBuyerDigestForAgent(agentId, opts);
      results.push(r);
      if (r.sent) sent++;
      else skipped++;
    } catch (e) {
      failed++;
      const reason = e instanceof Error ? e.message : "unknown";
      results.push({ agentId, sent: false, reason: `error:${reason}` });
      console.warn("[sphere-buyer-digest] agent failed", agentId, reason);
    }
  }

  return { totalAgents: agentIds.length, sent, skipped, failed, results };
}
