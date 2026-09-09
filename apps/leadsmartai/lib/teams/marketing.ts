import type { TeamRole } from "./types";

/**
 * Marketing across the team — the pure half.
 *
 * Performance says how much each agent did. This says whether each agent is
 * SET UP to do it, and what the setup is producing: a live hub, connected
 * networks, tracking on the hub, the Marketing Assistant's mode, posts in the
 * window, the queue ahead, and hub traffic. A broker reads it to coach — the
 * rows that need attention carry a reason, and the summary counts them.
 * The reading lives in marketing.server.ts.
 */

export type AutopilotMode = "ask" | "auto" | "review" | "assisted" | null;

/** Why a row needs the broker's attention, in the order they are worth raising. */
export type Attention = "no_hub" | "no_network" | "no_tracking" | "failing" | "silent";

export const ATTENTION_KEYS: readonly Attention[] = ["no_hub", "no_network", "no_tracking", "failing", "silent"];

export type MarketingInput = {
  agentId: string;
  role: TeamRole;
  name: string | null;
  email: string | null;
  hubPublished: boolean;
  username: string | null;
  /** Platforms with a connected account, e.g. "meta", "tiktok". Unique, sorted. */
  networks: string[];
  gaConfigured: boolean;
  pixelConfigured: boolean;
  autopilotMode: AutopilotMode;
  /** Posts that went out in the window. */
  postsPublished: number;
  /** Queued posts that failed in the window. */
  postsFailed: number;
  /** Queued posts still ahead. */
  scheduledUpcoming: number;
  lastPostAt: string | null;
  hubViews: number;
  hubLeads: number;
};

export type MarketingRow = MarketingInput & { attention: Attention[] };

export type MarketingSummary = {
  agents: number;
  hubPublished: number;
  withNetwork: number;
  /** Agents whose live hub has GA4 or a pixel. */
  withTracking: number;
  /** Agents whose Marketing Assistant posts on its own (auto or review). */
  autopilotOn: number;
  /** Agents with at least one post in the window. */
  posting: number;
  postsPublished: number;
  postsFailed: number;
  scheduledUpcoming: number;
  hubViews: number;
  hubLeads: number;
  /** Connected accounts per platform across the team. */
  byNetwork: Record<string, number>;
};

export type TeamMarketing = {
  days: number;
  rows: MarketingRow[];
  summary: MarketingSummary;
  /** Agents per attention reason, only the reasons that apply to someone. */
  attention: { key: Attention; count: number }[];
};

export function attentionFor(m: MarketingInput): Attention[] {
  const out: Attention[] = [];
  if (!m.hubPublished) out.push("no_hub");
  if (m.networks.length === 0) out.push("no_network");
  // Tracking only matters on a hub that is live; an unpublished hub already has its reason.
  if (m.hubPublished && !m.gaConfigured && !m.pixelConfigured) out.push("no_tracking");
  if (m.postsFailed > 0) out.push("failing");
  // Silent means set up and not using it: nothing went out and nothing is queued.
  if (m.networks.length > 0 && m.postsPublished === 0 && m.scheduledUpcoming === 0) out.push("silent");
  return out;
}

export function isAutopilotMode(v: unknown): v is Exclude<AutopilotMode, null> {
  return v === "ask" || v === "auto" || v === "review" || v === "assisted";
}

export function autopilotIsOn(mode: AutopilotMode): boolean {
  return mode === "auto" || mode === "review";
}

/**
 * Rows ordered by what the broker can act on: the most active first (posts,
 * then hub views), the team's own name order after that, so the same agent
 * lands in the same place from one visit to the next.
 */
export function buildTeamMarketing(days: number, input: readonly MarketingInput[]): TeamMarketing {
  const rows: MarketingRow[] = input.map((m) => ({ ...m, attention: attentionFor(m) }));
  rows.sort((a, b) => b.postsPublished - a.postsPublished || b.hubViews - a.hubViews || label(a).localeCompare(label(b)));

  const summary: MarketingSummary = {
    agents: rows.length,
    hubPublished: 0,
    withNetwork: 0,
    withTracking: 0,
    autopilotOn: 0,
    posting: 0,
    postsPublished: 0,
    postsFailed: 0,
    scheduledUpcoming: 0,
    hubViews: 0,
    hubLeads: 0,
    byNetwork: {},
  };
  const counts = new Map<Attention, number>();
  for (const r of rows) {
    if (r.hubPublished) summary.hubPublished += 1;
    if (r.networks.length > 0) summary.withNetwork += 1;
    if (r.hubPublished && (r.gaConfigured || r.pixelConfigured)) summary.withTracking += 1;
    if (autopilotIsOn(r.autopilotMode)) summary.autopilotOn += 1;
    if (r.postsPublished > 0) summary.posting += 1;
    summary.postsPublished += r.postsPublished;
    summary.postsFailed += r.postsFailed;
    summary.scheduledUpcoming += r.scheduledUpcoming;
    summary.hubViews += r.hubViews;
    summary.hubLeads += r.hubLeads;
    for (const n of r.networks) summary.byNetwork[n] = (summary.byNetwork[n] ?? 0) + 1;
    for (const a of r.attention) counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  const attention = ATTENTION_KEYS.filter((k) => counts.has(k)).map((k) => ({ key: k, count: counts.get(k)! }));
  return { days, rows, summary, attention };
}

function label(r: MarketingInput): string {
  return (r.name ?? r.email ?? r.agentId).toLowerCase();
}
