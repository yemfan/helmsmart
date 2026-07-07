import "server-only";

import { supabaseServer } from "@/lib/supabaseServer";
import { getSiteUrl } from "@/lib/siteUrl";
import { getLatestDigest } from "@/lib/newsletter/db";

/**
 * Weekly Marketing Assistant social recommender (Phase 1).
 *
 * Once a week (via cron, or on demand from the dashboard), each agent gets a
 * small queue of social-post DRAFTS in social_post_recommendations:
 *   - 1 TIMELY post composed from the latest newsletter digest's top item,
 *     linking to that issue.
 *   - 2 EVERGREEN posts drawn from the shared social_content_library, avoiding
 *     what the agent was recommended recently.
 *
 * Captions are composed DETERMINISTICALLY from stored fields (digest headline /
 * library hook+body+cta) — no per-post AI call, so this stays cheap. The agent's
 * autopilot MODE for (marketing_assistant, social) in boss_autopilot_settings
 * decides the initial status: 'auto' → 'approved' (autopilot fills the queue),
 * anything else → 'suggested' (approval mode, awaiting the agent's OK).
 *
 * All writes/reads here go through the service-role client (supabaseServer):
 * the library + newsletter tables are RLS-deny, and the cron writes across
 * agents. Dashboard-scoped mutations (approve/dismiss) use
 * updateRecommendationStatus, which is agent-scoped.
 */

export type SocialMode = "ask" | "auto";

/** The Monday (00:00 UTC) of the current week as YYYY-MM-DD. Matches the
 *  newsletter cron's week_of so timely links line up with a real issue. */
export function currentWeekOf(now: Date = new Date()): string {
  const day = now.getUTCDay(); // 0=Sun … 6=Sat
  const diff = (day + 6) % 7; // days since Monday
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff),
  );
  return monday.toISOString().slice(0, 10);
}

export type SocialRecommendation = {
  id: string;
  agent_id: string;
  week_of: string;
  source_type: "evergreen" | "timely";
  library_id: string | null;
  timely_ref: string | null;
  caption: string;
  hashtags: string[];
  link: string | null;
  image_prompt: string | null;
  status: "suggested" | "approved" | "dismissed" | "copied";
  created_at: string;
};

const REC_SELECT =
  "id, agent_id, week_of, source_type, library_id, timely_ref, caption, hashtags, link, image_prompt, status, created_at";

type LibraryRow = {
  id: string;
  category: string;
  title: string;
  hook: string;
  body: string;
  hashtags: string[] | null;
  cta: string | null;
  image_prompt: string | null;
};

/** The agent's autopilot mode for (marketing_assistant, social); default 'ask'. */
export async function getSocialMode(agentId: string): Promise<SocialMode> {
  try {
    const { data } = await supabaseServer
      .from("boss_autopilot_settings")
      .select("mode")
      .eq("agent_id", agentId)
      .eq("assignee", "marketing_assistant")
      .eq("channel", "social")
      .maybeSingle();
    const mode = (data as { mode?: string } | null)?.mode;
    return mode === "auto" ? "auto" : "ask";
  } catch {
    return "ask";
  }
}

/** Upsert the agent's social autopilot mode. */
export async function setSocialMode(agentId: string, mode: SocialMode): Promise<void> {
  await supabaseServer.from("boss_autopilot_settings").upsert(
    {
      agent_id: agentId,
      assignee: "marketing_assistant",
      channel: "social",
      mode,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "agent_id,assignee,channel" },
  );
}

/** This agent's recommendations for a week, newest first. Service-role read. */
export async function listRecommendations(
  agentId: string,
  weekOf: string,
): Promise<SocialRecommendation[]> {
  const { data, error } = await supabaseServer
    .from("social_post_recommendations")
    .select(REC_SELECT)
    .eq("agent_id", agentId)
    .eq("week_of", weekOf)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as SocialRecommendation[]).map(normalizeRec);
}

/**
 * Approve / dismiss / mark-copied a single recommendation. Agent-scoped: the
 * update is constrained to rows the agent owns, so one agent can't touch
 * another's queue even through the service-role client.
 */
export async function updateRecommendationStatus(
  agentId: string,
  recId: string,
  status: SocialRecommendation["status"],
): Promise<boolean> {
  const { data, error } = await supabaseServer
    .from("social_post_recommendations")
    .update({ status })
    .eq("id", recId)
    .eq("agent_id", agentId)
    .select("id")
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

/**
 * Build this agent's weekly recommendations (idempotent per (agent, week)).
 * Returns the number of rows inserted (0 when nothing to add or already done).
 */
export async function generateWeeklyRecommendations(
  agentId: string,
  weekOf: string,
): Promise<{ count: number }> {
  // Idempotent: if this agent already has any rec for this week, skip.
  const { count: existing } = await supabaseServer
    .from("social_post_recommendations")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .eq("week_of", weekOf);
  if ((existing ?? 0) > 0) return { count: 0 };

  const mode = await getSocialMode(agentId);
  const status: SocialRecommendation["status"] = mode === "auto" ? "approved" : "suggested";

  const rows: Record<string, unknown>[] = [];

  // (a) 1 TIMELY from the latest published digest's top item.
  const timely = await buildTimelyRow(agentId, weekOf, status);
  if (timely) rows.push(timely);

  // (b) 2 EVERGREEN from the shared library, avoiding recent picks.
  const evergreen = await buildEvergreenRows(agentId, weekOf, status, 2);
  rows.push(...evergreen);

  if (rows.length === 0) return { count: 0 };

  const { data, error } = await supabaseServer
    .from("social_post_recommendations")
    .insert(rows)
    .select("id");
  if (error) {
    console.warn(
      `[social] insert recommendations failed for agent ${agentId}:`,
      error.message,
    );
    return { count: 0 };
  }
  return { count: Array.isArray(data) ? data.length : 0 };
}

/**
 * Weekly cron entry point. Iterates every agent that has opted into social
 * recommendations by setting a boss_autopilot_settings row for
 * (marketing_assistant, social) — BOTH 'auto' AND 'ask'.
 *
 * Rationale: 'auto' agents want the queue auto-filled; 'ask' agents still want
 * suggestions waiting when they open the Marketing Assistant on Monday (they
 * just approve each rather than have them pre-approved). generateWeeklyRecommendations
 * is idempotent per (agent, week) and already maps mode → initial status, so a
 * single pass over every opted-in agent is correct for both.
 */
export async function runWeeklyRecommendationsForOptedInAgents(
  now: Date = new Date(),
): Promise<{ weekOf: string; agents: number; created: number }> {
  const weekOf = currentWeekOf(now);
  const { data } = await supabaseServer
    .from("boss_autopilot_settings")
    .select("agent_id")
    .eq("assignee", "marketing_assistant")
    .eq("channel", "social");

  const ids = Array.from(
    new Set(
      ((data ?? []) as { agent_id: number | string }[])
        .map((r) => String(r.agent_id))
        .filter(Boolean),
    ),
  );

  let created = 0;
  for (const agentId of ids) {
    try {
      const { count } = await generateWeeklyRecommendations(agentId, weekOf);
      created += count;
    } catch (e) {
      console.error(
        `[social-weekly] failed for agent ${agentId}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }
  return { weekOf, agents: ids.length, created };
}

// ── composition ───────────────────────────────────────────────────────────────

async function buildTimelyRow(
  agentId: string,
  weekOf: string,
  status: SocialRecommendation["status"],
): Promise<Record<string, unknown> | null> {
  const digest = await getLatestDigest();
  if (!digest || !Array.isArray(digest.items) || digest.items.length === 0) return null;

  const top = digest.items[0];
  if (!top || !top.headline) return null;

  // Consumer-voice caption composed ONLY from the digest's already-cited copy —
  // no new numbers introduced here (anti-fabrication).
  const why = top.why_it_matters?.trim();
  const caption = [top.headline.trim(), why].filter(Boolean).join(" ");

  const link = `${getSiteUrl()}/newsletter/national/${digest.week_of}`;
  const hashtags = ["#housingmarket", "#mortgagerates", "#realestate", "#homebuyers"];

  return {
    agent_id: agentId,
    week_of: weekOf,
    source_type: "timely",
    library_id: null,
    timely_ref: digest.week_of,
    caption,
    hashtags,
    link,
    image_prompt: "A clean chart or headline graphic about this week's housing market.",
    status,
  };
}

async function buildEvergreenRows(
  agentId: string,
  weekOf: string,
  status: SocialRecommendation["status"],
  n: number,
): Promise<Record<string, unknown>[]> {
  // Anti-repeat: exclude library rows used in the agent's last ~8 recs.
  const { data: recent } = await supabaseServer
    .from("social_post_recommendations")
    .select("library_id")
    .eq("agent_id", agentId)
    .eq("source_type", "evergreen")
    .order("created_at", { ascending: false })
    .limit(8);
  const recentIds = new Set<string>(
    ((recent ?? []) as { library_id: string | null }[])
      .map((r) => r.library_id)
      .filter((id): id is string => Boolean(id)),
  );

  // Pull a modest pool of active library rows and pick the freshest not-recent
  // ones (with a light shuffle so two agents on the same week don't get an
  // identical pair).
  const { data: lib } = await supabaseServer
    .from("social_content_library")
    .select("id, category, title, hook, body, hashtags, cta, image_prompt")
    .eq("status", "active")
    .limit(200);
  const pool = ((lib ?? []) as LibraryRow[]).filter((r) => !recentIds.has(r.id));
  // Fall back to the full active set if anti-repeat drained the pool.
  const candidates = pool.length >= n ? pool : ((lib ?? []) as LibraryRow[]);

  const picked = shuffle(candidates).slice(0, n);
  return picked.map((row) => ({
    agent_id: agentId,
    week_of: weekOf,
    source_type: "evergreen",
    library_id: row.id,
    timely_ref: null,
    caption: composeEvergreenCaption(row),
    hashtags: Array.isArray(row.hashtags) ? row.hashtags : [],
    link: null,
    image_prompt: row.image_prompt ?? null,
    status,
  }));
}

/** Caption = hook + body (+ cta) from the stored library row. Deterministic. */
function composeEvergreenCaption(row: LibraryRow): string {
  return [row.hook?.trim(), row.body?.trim(), row.cta?.trim()]
    .filter(Boolean)
    .join("\n\n");
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeRec(row: SocialRecommendation): SocialRecommendation {
  return {
    ...row,
    agent_id: String(row.agent_id),
    hashtags: Array.isArray(row.hashtags) ? row.hashtags : [],
  };
}
