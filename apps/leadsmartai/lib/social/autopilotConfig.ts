import "server-only";

import {
  DEFAULT_PUBLISH_HOUR_UTC,
  normalizePostsPerPeriod,
  normalizeWeekdays,
} from "@helm/dna-marketing";

import { supabaseServer } from "@/lib/supabaseServer";

import { isSocialMode, type SocialMode } from "./recommend";

/**
 * The social auto-post controller: everything an agent can decide about their
 * automated posting, in one place.
 *
 * All the "which/when/how often" fields are NULLABLE in the database and mean
 * "no preference". That's deliberate — an agent who never opens the control
 * keeps exactly today's behaviour (fan out to every connected account, any
 * category, one post a day at 16:00 UTC on cadence-derived days). Only an
 * explicit choice narrows anything.
 *
 * Stored on `boss_autopilot_settings` for (agent, 'marketing_assistant',
 * 'social') — the same row that already held `mode` and `posts_per_week`, so
 * there is ONE source of truth for social automation rather than a second
 * competing table.
 */

/** Platforms the controller can target. Mirrors scheduled_posts.platform. */
export const CONTROLLABLE_PLATFORMS = [
  "facebook",
  "instagram",
  "linkedin",
  "threads",
] as const;
export type ControllablePlatform = (typeof CONTROLLABLE_PLATFORMS)[number];

/** Content buckets, matching social_content_library.category. */
export const CONTENT_CATEGORIES = [
  "buying",
  "selling",
  "financing",
  "market_basics",
  "pitfalls",
  "how_to",
  "staging",
  "negotiation",
  "brand",
] as const;
export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

export type SocialAutopilotConfig = {
  /** Who signs off before a post publishes. */
  mode: SocialMode;
  /** Posts per week (1-7). */
  postsPerWeek: number;
  /** Target platforms, or null for "every connected account". */
  platforms: ControllablePlatform[] | null;
  /** Evergreen categories to draw from, or null for "any". */
  contentCategories: ContentCategory[] | null;
  /** Include the weekly timely/news post in the mix. */
  includeTimely: boolean;
  /** Max posts on one day, or null for one per day. */
  postsPerDay: number | null;
  /** Allowed weekdays (0=Sun…6=Sat), or null to derive from cadence. */
  postDays: number[] | null;
  /** Publish hour UTC, or null for the 16:00 default. */
  postHourUtc: number | null;
  /** Let the AI choose platforms / content / cadence each period. */
  aiManaged: boolean;
};

/** What the engine falls back to when nothing has been configured. */
export const DEFAULT_AUTOPILOT_CONFIG: SocialAutopilotConfig = {
  mode: "ask",
  postsPerWeek: 3,
  platforms: null,
  contentCategories: null,
  includeTimely: true,
  postsPerDay: null,
  postDays: null,
  postHourUtc: null,
  aiManaged: false,
};

/** The hour the engine will actually publish at, resolving the null default. */
export function effectivePostHourUtc(cfg: SocialAutopilotConfig): number {
  return cfg.postHourUtc ?? DEFAULT_PUBLISH_HOUR_UTC;
}

function coerceStringArray<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T[] | null {
  if (!Array.isArray(value)) return null;
  const out = [...new Set(value)].filter((v): v is T =>
    (allowed as readonly string[]).includes(v as string),
  );
  // An empty result means the stored list was junk (or explicitly emptied);
  // treat it as "no preference" so automation never goes silently dark.
  return out.length > 0 ? out : null;
}

type SettingsRow = {
  mode?: string | null;
  posts_per_week?: number | null;
  platforms?: unknown;
  content_categories?: unknown;
  include_timely?: boolean | null;
  posts_per_day?: number | null;
  post_days?: unknown;
  post_hour_utc?: number | null;
  ai_managed?: boolean | null;
};

const SELECT_COLUMNS =
  "mode, posts_per_week, platforms, content_categories, include_timely, posts_per_day, post_days, post_hour_utc, ai_managed";

/**
 * Read the full controller config. Never throws — a missing row, a missing
 * column (migration not yet applied) or a bad value all degrade to the
 * defaults, because failing to READ settings must not stop the poster.
 */
export async function getSocialAutopilotConfig(
  agentId: string,
): Promise<SocialAutopilotConfig> {
  let row: SettingsRow | null = null;
  try {
    const { data } = await supabaseServer
      .from("boss_autopilot_settings")
      .select(SELECT_COLUMNS)
      .eq("agent_id", agentId)
      .eq("assignee", "marketing_assistant")
      .eq("channel", "social")
      .maybeSingle();
    row = (data as SettingsRow | null) ?? null;
  } catch {
    return { ...DEFAULT_AUTOPILOT_CONFIG };
  }
  if (!row) return { ...DEFAULT_AUTOPILOT_CONFIG };

  const postsPerDay =
    typeof row.posts_per_day === "number" && row.posts_per_day >= 1 && row.posts_per_day <= 5
      ? row.posts_per_day
      : null;
  const postHourUtc =
    typeof row.post_hour_utc === "number" && row.post_hour_utc >= 0 && row.post_hour_utc <= 23
      ? row.post_hour_utc
      : null;

  return {
    mode: isSocialMode(row.mode) ? row.mode : "ask",
    postsPerWeek: normalizePostsPerPeriod(row.posts_per_week),
    platforms: coerceStringArray(row.platforms, CONTROLLABLE_PLATFORMS),
    contentCategories: coerceStringArray(row.content_categories, CONTENT_CATEGORIES),
    includeTimely: row.include_timely !== false,
    postsPerDay,
    // Only treat an explicitly-stored list as a restriction; normalizeWeekdays
    // would otherwise turn "unset" into "all seven days", which reads the same
    // but hides whether the agent actually chose.
    postDays: Array.isArray(row.post_days) ? normalizeWeekdays(row.post_days) : null,
    postHourUtc,
    aiManaged: row.ai_managed === true,
  };
}

export type SocialAutopilotPatch = Partial<
  Omit<SocialAutopilotConfig, "mode"> & { mode: SocialMode }
>;

/**
 * Write part (or all) of the controller. Only the keys present in `patch` are
 * touched, so the settings UI can save one control without clobbering the rest.
 */
export async function updateSocialAutopilotConfig(
  agentId: string,
  patch: SocialAutopilotPatch,
): Promise<void> {
  const row: Record<string, unknown> = {
    agent_id: agentId,
    assignee: "marketing_assistant",
    channel: "social",
    updated_at: new Date().toISOString(),
  };

  if (patch.mode !== undefined) row.mode = patch.mode;
  if (patch.postsPerWeek !== undefined) row.posts_per_week = patch.postsPerWeek;
  if (patch.platforms !== undefined) row.platforms = patch.platforms;
  if (patch.contentCategories !== undefined) {
    row.content_categories = patch.contentCategories;
  }
  if (patch.includeTimely !== undefined) row.include_timely = patch.includeTimely;
  if (patch.postsPerDay !== undefined) row.posts_per_day = patch.postsPerDay;
  if (patch.postDays !== undefined) row.post_days = patch.postDays;
  if (patch.postHourUtc !== undefined) row.post_hour_utc = patch.postHourUtc;
  if (patch.aiManaged !== undefined) row.ai_managed = patch.aiManaged;

  const { error } = await supabaseServer
    .from("boss_autopilot_settings")
    .upsert(row, { onConflict: "agent_id,assignee,channel" });
  if (error) throw new Error(error.message);
}
