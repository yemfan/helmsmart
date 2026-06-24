import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { scoreBehavior, type BehaviorEvent } from "@/lib/contacts/behavior/scoring";

/**
 * Composite "system" lead rating — the SINGLE writer of `contacts.rating`.
 *
 * Blends every engagement signal we have into one hot/warm/cold:
 *   - web behavior (property views/favorites, report unlocks, alert clicks…)
 *     via the existing scoreBehavior() engine → engagement_score 0-100;
 *   - the latest AI-call rating (a `call_rated` contact_event);
 *   - open-house attendance (an `open_house_signin` contact_event);
 *   - SMS engagement (a recent inbound reply) and opt-out.
 *
 * Uses a "strongest signal wins" upgrade (a hot call makes a hot lead; an
 * open-house sign-in or SMS reply makes at least warm; an opt-out forces cold),
 * so a single strong signal surfaces the lead without being diluted by a low
 * additive score. Respects `rating_manual_override`. Also writes a
 * `contact_scores` history row and a `rating_changed` audit event.
 *
 * Previously two systems fought over `contacts.rating` with different
 * vocabularies (the nightly cron wrote A/B/C/D; calls/SMS/UI use hot/warm/cold).
 * Everything now routes through here.
 */

export type LeadRating = "hot" | "warm" | "cold";

const MODEL_VERSION = "v2-composite";
const DAY = 24 * 60 * 60 * 1000;

export async function recomputeLeadRating(contactId: string): Promise<LeadRating | null> {
  const { data: c } = await supabaseAdmin
    .from("contacts")
    .select(
      "rating, rating_manual_override, agent_id, sms_opt_in, sms_opted_out_at, sms_last_inbound_at",
    )
    .eq("id", contactId)
    .maybeSingle();
  if (!c) return null;
  const row = c as {
    rating: string | null;
    rating_manual_override: boolean | null;
    agent_id: unknown;
    sms_opt_in: boolean | null;
    sms_opted_out_at: string | null;
    sms_last_inbound_at: string | null;
  };

  const now = Date.now();
  const sinceIso = new Date(now - 30 * DAY).toISOString();

  const { data: rawEvents } = await supabaseAdmin
    .from("contact_events")
    .select("event_type, created_at, payload")
    .eq("contact_id", contactId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(500);
  const evs = (rawEvents ?? []) as {
    event_type: string;
    created_at: string;
    payload: Record<string, unknown> | null;
  }[];

  // Web behavior (the scorer ignores event types it doesn't weight, so the
  // call/open-house events below don't double-count here).
  const behaviorEvents: BehaviorEvent[] = evs.map((e) => ({
    eventType: e.event_type,
    createdAt: e.created_at,
    payload: e.payload ?? {},
  }));
  const { score: engagement, factors } = scoreBehavior(behaviorEvents, { now: new Date(now) });

  // Discrete signals.
  const latestCallRaw = evs.find((e) => e.event_type === "call_rated")?.payload?.rating;
  const callRating: LeadRating | null =
    latestCallRaw === "hot" || latestCallRaw === "warm" || latestCallRaw === "cold"
      ? (latestCallRaw as LeadRating)
      : null;
  const openHouse = evs.find((e) => e.event_type === "open_house_signin");
  const openHouseTimeline = openHouse?.payload?.timeline;
  const smsRepliedRecent =
    row.sms_last_inbound_at != null && now - new Date(row.sms_last_inbound_at).getTime() < 14 * DAY;
  const optedOut = row.sms_opt_in === false || row.sms_opted_out_at != null;

  // Blend — strongest signal wins (only upgrades).
  let rating: LeadRating = "cold";
  const bump = (r: LeadRating) => {
    if (r === "hot") rating = "hot";
    else if (r === "warm" && rating !== "hot") rating = "warm";
  };
  if (engagement >= 40) bump("hot");
  else if (engagement >= 12) bump("warm");
  if (callRating) bump(callRating);
  // Open-house attendance: near-term timeline → hot, otherwise warm.
  if (openHouse) bump(openHouseTimeline === "now" || openHouseTimeline === "3_6_months" ? "hot" : "warm");
  if (smsRepliedRecent) bump("warm");
  if (optedOut) rating = "cold"; // opted out → never nurture-rated

  // Manual override: keep the agent's pinned rating, but still refresh the
  // engagement score so the rest of the UI stays current.
  if (row.rating_manual_override) {
    await supabaseAdmin
      .from("contacts")
      .update({ engagement_score: engagement } as never)
      .eq("id", contactId);
    return (row.rating as LeadRating | null) ?? null;
  }

  const changed = rating !== row.rating;
  const update: Record<string, unknown> = { engagement_score: engagement };
  if (changed) update.rating = rating;
  await supabaseAdmin
    .from("contacts")
    .update(update as never)
    .eq("id", contactId);

  // History row (agent_id is NOT NULL on contact_scores — always include it).
  await supabaseAdmin.from("contact_scores").insert({
    contact_id: contactId,
    agent_id: row.agent_id as never,
    score: engagement,
    label: rating,
    factors: {
      engagement,
      call: callRating,
      open_house: openHouse ? (openHouseTimeline ?? true) : false,
      sms_reply: smsRepliedRecent,
      opted_out: optedOut,
      behavior: factors,
    } as never,
    model_version: MODEL_VERSION,
    computed_at: new Date(now).toISOString(),
  } as never);

  if (changed) {
    await supabaseAdmin.from("contact_events").insert({
      contact_id: contactId,
      agent_id: row.agent_id as never,
      event_type: "rating_changed",
      source: "system",
      payload: { from: row.rating, to: rating, reason: "composite", engagement, model_version: MODEL_VERSION } as never,
    } as never);
  }

  return rating;
}
