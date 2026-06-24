/**
 * Behavioral scoring — pure. Tests go in __tests__/scoring.test.ts.
 *
 * Input: an array of raw events for a contact (from contact_events).
 * Output: a numeric engagement score and the top contributing factors.
 *
 * Design:
 *   - Each event type has a base weight (see EVENT_WEIGHTS below).
 *   - Weights decay with recency: recent events count more than old ones.
 *     Half-life = 14 days, floor = 30 days (events older than 30 days
 *     contribute 0). Matches typical real-estate buying-intent windows.
 *   - Score is clamped to [0, 100] so downstream sort orders are stable.
 *   - The function is pure and synchronous so the cron can batch
 *     thousands of contacts without async overhead.
 */

export type BehaviorEvent = {
  eventType: string;
  createdAt: string | Date;
  payload?: Record<string, unknown>;
};

export type BehaviorScore = {
  score: number;
  factors: Array<{ eventType: string; count: number; weight: number }>;
  computedAt: string;
};

/**
 * Event weights. Higher = stronger buying-intent signal. Calibrate over
 * time as real usage data comes in; these are the v1 defaults.
 *
 * Rationale:
 *   - property_favorite is strongest among passive signals — someone
 *     favoriting a specific home is declaring interest.
 *   - report_unlocked submitted their email/phone to get a valuation,
 *     also strong.
 *   - listing_alert_clicked means they engaged with an alert we sent.
 *     Compound signal: they saved a search AND acted on it.
 *   - property_view is noisy (bots, idle tabs) so low weight.
 *   - search_performed by itself is low; it indicates general browsing.
 *   - return_visit fires when a contact re-enters the site after >= 3
 *     days of absence — strong recurrence signal.
 *   - email engagement (we sent → they acted): a reply is a strong
 *     two-way signal, a click is a real action on our content, an open
 *     is weak (proxy prefetch / preview panes inflate it).
 */
export const EVENT_WEIGHTS: Record<string, number> = {
  property_favorite: 6,
  email_reply: 6,
  report_unlocked: 5,
  listing_alert_clicked: 5,
  email_click: 5,
  saved_search_created: 4,
  return_visit: 3,
  property_share: 3,
  property_view: 1,
  search_performed: 1,
  listing_alert_opened: 1,
  saved_search_match: 1,
  email_open: 1,
};

/**
 * Recency decay. Each event's effective weight is:
 *   weight * 0.5 ** (ageDays / HALF_LIFE_DAYS), with a hard zero at FLOOR_DAYS.
 * 14-day half-life means an event 14 days old counts half, 28 days → quarter.
 */
const HALF_LIFE_DAYS = 14;
const FLOOR_DAYS = 30;

/**
 * Maximum score — above this we clamp. Keeps the 0-100 rating familiar and
 * prevents outliers (a lead who clicks 50 alerts) from blowing the scale.
 */
const MAX_SCORE = 100;

function ageDays(createdAt: string | Date, now: Date): number {
  const t = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return Math.max(0, (now.getTime() - t) / (1000 * 60 * 60 * 24));
}

function decayedWeight(baseWeight: number, ageD: number): number {
  if (ageD > FLOOR_DAYS) return 0;
  return baseWeight * Math.pow(0.5, ageD / HALF_LIFE_DAYS);
}

export function scoreBehavior(
  events: BehaviorEvent[],
  opts: { now?: Date } = {},
): BehaviorScore {
  const now = opts.now ?? new Date();

  // Sum per event_type so we can report a factor breakdown.
  const perType = new Map<string, { count: number; weight: number }>();
  let total = 0;

  for (const ev of events) {
    const base = EVENT_WEIGHTS[ev.eventType];
    if (!base) continue; // unknown types don't contribute
    const w = decayedWeight(base, ageDays(ev.createdAt, now));
    if (w <= 0) continue;
    total += w;

    const entry = perType.get(ev.eventType) ?? { count: 0, weight: 0 };
    entry.count += 1;
    entry.weight += w;
    perType.set(ev.eventType, entry);
  }

  const score = Math.min(MAX_SCORE, Math.round(total));

  const factors = Array.from(perType.entries())
    .map(([eventType, v]) => ({
      eventType,
      count: v.count,
      weight: Math.round(v.weight * 10) / 10,
    }))
    .sort((a, b) => b.weight - a.weight);

  return {
    score,
    factors,
    computedAt: now.toISOString(),
  };
}

// =============================================================================
// Intent signal detection — rules that convert event patterns into signals.
// =============================================================================

export type IntentSignalProposal = {
  signalType: string;
  label: string;
  confidence: "low" | "medium" | "high";
  suggestedAction: string;
  // Payload carried into contact_signals.payload for UI context.
  payload: Record<string, unknown>;
  // Dedup key: same signal for same trigger shouldn't re-fire. Built from
  // signal_type + identifying payload fields. Cron passes this to the DB
  // layer which checks for an un-dismissed signal with a matching payload.
  dedupKey: string;
};

/**
 * "Viewed same property 3+ times in 48h" — strongest specific-property signal.
 * A contact browsing the same address repeatedly is telegraphing interest.
 */
function detectSpecificPropertyInterest(
  events: BehaviorEvent[],
  now: Date,
): IntentSignalProposal[] {
  const windowStart = now.getTime() - 48 * 60 * 60 * 1000;
  const byProperty = new Map<
    string,
    { address: string | null; count: number; lastAt: number }
  >();

  for (const ev of events) {
    if (ev.eventType !== "property_view") continue;
    const t = new Date(ev.createdAt).getTime();
    if (!Number.isFinite(t) || t < windowStart) continue;

    const propId =
      (ev.payload?.property_id as string | undefined) ??
      (ev.payload?.address as string | undefined) ??
      null;
    if (!propId) continue;

    const address =
      (ev.payload?.address as string | undefined) ??
      (ev.payload?.property_address as string | undefined) ??
      null;

    const cur = byProperty.get(propId) ?? { address, count: 0, lastAt: 0 };
    cur.count += 1;
    cur.lastAt = Math.max(cur.lastAt, t);
    if (address && !cur.address) cur.address = address;
    byProperty.set(propId, cur);
  }

  const out: IntentSignalProposal[] = [];
  for (const [propId, info] of byProperty) {
    if (info.count < 3) continue;
    out.push({
      signalType: "specific_property_interest",
      label: info.address
        ? `Viewed ${info.address} ${info.count}× in 48h`
        : `Viewed same property ${info.count}× in 48h`,
      confidence: info.count >= 5 ? "high" : "medium",
      suggestedAction: info.address
        ? `Call — ask if they'd like to tour ${info.address}`
        : "Call — ask which property they're researching and offer a tour",
      payload: {
        property_id: propId,
        address: info.address,
        view_count: info.count,
        window_hours: 48,
      },
      dedupKey: `specific_property_interest:${propId}`,
    });
  }
  return out;
}

/**
 * "6+ property interactions in 3 days" — generic high-intent signal.
 * Fires for someone deep in research mode across multiple homes.
 */
function detectHighIntentReturning(
  events: BehaviorEvent[],
  now: Date,
): IntentSignalProposal[] {
  const windowStart = now.getTime() - 3 * 24 * 60 * 60 * 1000;
  const interactionTypes = new Set([
    "property_view",
    "property_favorite",
    "property_share",
    "search_performed",
    "listing_alert_clicked",
  ]);

  let count = 0;
  let earliest = Infinity;
  let latest = 0;
  for (const ev of events) {
    if (!interactionTypes.has(ev.eventType)) continue;
    const t = new Date(ev.createdAt).getTime();
    if (!Number.isFinite(t) || t < windowStart) continue;
    count += 1;
    earliest = Math.min(earliest, t);
    latest = Math.max(latest, t);
  }

  if (count < 6) return [];

  return [
    {
      signalType: "high_intent_returning",
      label: `${count} property interactions in the last 3 days`,
      confidence: count >= 12 ? "high" : "medium",
      suggestedAction: "Call — they're in active research mode, likely within 30 days of deciding",
      payload: {
        interaction_count: count,
        window_hours: 72,
        earliest_at: new Date(earliest).toISOString(),
        latest_at: new Date(latest).toISOString(),
      },
      // One per contact per 3-day window — key on date so it can re-fire
      // next week if they return after going cold.
      dedupKey: `high_intent_returning:${new Date(now).toISOString().slice(0, 10)}`,
    },
  ];
}

/**
 * "Saved search created" — lower-priority but useful for new-search workflow.
 * Fires once per saved_search_created event so the agent sees it in the feed.
 */
function detectSavedSearchCreated(
  events: BehaviorEvent[],
  now: Date,
): IntentSignalProposal[] {
  const out: IntentSignalProposal[] = [];
  const twoDaysAgo = now.getTime() - 2 * 24 * 60 * 60 * 1000;
  for (const ev of events) {
    if (ev.eventType !== "saved_search_created") continue;
    const t = new Date(ev.createdAt).getTime();
    if (!Number.isFinite(t) || t < twoDaysAgo) continue;
    const searchId = (ev.payload?.saved_search_id as string | undefined) ?? null;
    const name = (ev.payload?.name as string | undefined) ?? null;
    out.push({
      signalType: "saved_search_created",
      label: name ? `Saved search: ${name}` : "Saved a new search",
      confidence: "medium",
      suggestedAction: "Send a personal note acknowledging what they're looking for",
      payload: { saved_search_id: searchId, name },
      dedupKey: `saved_search_created:${searchId ?? t}`,
    });
  }
  return out;
}

/**
 * Run every signal detector and return the combined proposals. The cron
 * passes these to the DB layer which dedups against existing un-dismissed
 * contact_signals rows using the dedupKey.
 */
export function detectIntentSignals(
  events: BehaviorEvent[],
  opts: { now?: Date } = {},
): IntentSignalProposal[] {
  const now = opts.now ?? new Date();
  return [
    ...detectSpecificPropertyInterest(events, now),
    ...detectHighIntentReturning(events, now),
    ...detectSavedSearchCreated(events, now),
  ];
}

// Event type constants — the ingestion route validates against these to
// keep the event_type column clean.
export const BEHAVIOR_EVENT_TYPES = [
  "property_view",
  "property_favorite",
  "favorite_removed",
  "property_share",
  "search_performed",
  "saved_search_created",
  "saved_search_match",
  "listing_alert_opened",
  "listing_alert_clicked",
  "return_visit",
  "report_unlocked",
] as const;

export type BehaviorEventType = (typeof BEHAVIOR_EVENT_TYPES)[number];

export function isBehaviorEventType(v: string): v is BehaviorEventType {
  return (BEHAVIOR_EVENT_TYPES as readonly string[]).includes(v);
}
