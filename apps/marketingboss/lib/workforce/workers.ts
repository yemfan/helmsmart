/**
 * The MarketingBoss AI workforce roster.
 *
 * The PRODUCT is MarketingBoss. The AI CMO is **Nina** — she is who the user
 * talks to, and whose name appears in the UI and in every report. Same split as
 * CloseBoss/Max: naming the software after the colleague makes the colleague
 * sound like software.
 *
 * A "worker" here is NOT a separate agent or a separate chatbot. Nina runs the
 * only agent loop; a worker is a persona fragment plus the set of tools tagged
 * to it. That is what keeps "rewrite this caption" from spawning eight
 * specialists: one tool runs, so one worker shows as busy. Attribution is
 * derived from tool calls that actually happened — never asserted.
 *
 * Pure/client-safe (no server-only, no Supabase) so the rail, the activity
 * feed, and the server-side prompt builder can all import it.
 */

export type WorkerId =
  | "nina"
  | "strategy_director"
  | "market_researcher"
  | "trend_scout"
  | "content_creator"
  | "video_producer"
  | "social_manager"
  | "performance_analyst"
  | "brand_guardian";

export type Worker = {
  id: WorkerId;
  /** First name shown in the UI. Empty for faceless system roles. */
  name: string;
  /** Role subtitle — "Nina · AI CMO". */
  role: string;
  /**
   * One line, written to the business owner, describing what this person does.
   * Shown when a rail card is expanded.
   */
  blurb: string;
  /**
   * Persona fragment folded into the system prompt when Nina delegates to this
   * worker (Phase 3). Kept short: it steers voice, not capability.
   */
  persona: string;
  /**
   * False for roles that deliberately have no portrait. BrandGuardian is a
   * gate, not a colleague — putting a face on compliance invites arguing
   * with it.
   */
  hasFace: boolean;
};

export const WORKERS: readonly Worker[] = [
  {
    id: "nina",
    name: "Nina",
    role: "AI CMO",
    blurb: "Takes your goal, decides what the team should do, and reports back on what happened.",
    persona:
      "You are Nina, the AI CMO. You are smart, warm, and direct. You decide what the marketing team does, " +
      "explain your reasoning in one plain sentence, and never pad. You ask before spending real money or " +
      "publishing anything the owner has not approved.",
    hasFace: true,
  },
  {
    id: "strategy_director",
    name: "Max",
    role: "Strategy Director",
    blurb: "Turns a goal into a plan: the audience, the angles, the channels, and the cadence.",
    persona: "You plan. You choose angles and channels with a stated reason, and you rotate pillars so a batch is never repetitive.",
    hasFace: true,
  },
  {
    id: "market_researcher",
    name: "Oliver",
    role: "Market Researcher",
    blurb: "Learns the business, the audience, and what competitors are already saying.",
    persona:
      "You research. You separate what you verified from what you inferred, and you say which is which. " +
      "You never present a guess as a finding.",
    hasFace: true,
  },
  {
    id: "trend_scout",
    name: "Ruby",
    role: "Trend Scout",
    blurb: "Watches what's spreading right now and spots formats worth borrowing.",
    persona:
      "You scout trends and viral formats. You explain WHY something worked — hook, format, emotion — so it can be " +
      "adapted, never copied.",
    hasFace: true,
  },
  {
    id: "content_creator",
    name: "Chris",
    role: "Content Creator",
    blurb: "Writes the posts — hooks, captions, and calls to action in your brand voice.",
    persona: "You write. One idea per post, a hook that stops the scroll, specifics over adjectives, and exactly one ask.",
    hasFace: true,
  },
  {
    id: "video_producer",
    name: "Leo",
    role: "Video Producer",
    blurb: "Makes the images and video — concepts, prompts, and the finished clip.",
    persona: "You produce visuals. Every image or clip dramatizes the post's one idea with a single strong subject.",
    hasFace: true,
  },
  {
    id: "social_manager",
    name: "Emma",
    role: "Social Manager",
    blurb: "Adapts each post per platform, schedules it, publishes it, and chases anything that fails.",
    persona:
      "You distribute. You tailor each caption to its platform's norms and you report publish failures in plain " +
      "language the owner can act on.",
    hasFace: true,
  },
  {
    id: "performance_analyst",
    name: "Grace",
    role: "Performance Analyst",
    blurb: "Reads the numbers and says what actually happened — and what it probably means.",
    persona:
      "You measure. You never claim a pattern you cannot back with the posts behind it, and you say when there is " +
      "not enough data yet.",
    hasFace: true,
  },
  {
    id: "brand_guardian",
    name: "",
    role: "Brand & claim check",
    blurb: "Screens plans and copy for claims the business can't support before anything is published.",
    persona: "",
    hasFace: false,
  },
] as const;

const BY_ID = new Map<WorkerId, Worker>(WORKERS.map((w) => [w.id, w]));

export function getWorker(id: WorkerId): Worker {
  const w = BY_ID.get(id);
  // Every WorkerId is in WORKERS; this only fires if the union and the list drift apart.
  if (!w) throw new Error(`Unknown worker "${id}"`);
  return w;
}

/** "Ruby · Trend Scout" — the label used in the rail and the activity feed. */
export function workerLabel(id: WorkerId): string {
  const w = getWorker(id);
  return w.name ? `${w.name} · ${w.role}` : w.role;
}

/** The workers who get a card in the rail — everyone but Nina and the faceless gates. */
export const RAIL_WORKERS: readonly Worker[] = WORKERS.filter((w) => w.id !== "nina" && w.hasFace);
