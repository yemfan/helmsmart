/**
 * Social autopilot — Emily writes posts ABOUT the business on a cadence and
 * schedules them into `social_posts`; the existing 15-minute publish cron sends
 * the ones that are due. Reuses the shared @helm/dna-marketing cadence planner.
 *
 * Content is generated PER BUSINESS (industry-agnostic): there is no content
 * library to seed. Each post is written from the org's own context (name +
 * knowledge base + services) using the same drafter the composer uses.
 *
 * Instagram is deliberately excluded from autopilot: these are text-only posts
 * and IG's API requires an image, so a generated IG row could never publish.
 */
import {
  DEFAULT_PUBLISH_HOUR_UTC,
  normalizePostsPerPeriod,
  planPublishTimes,
} from "@helm/dna-marketing";

import { generateSocialPost } from "@/lib/actions/social";
import { createServiceClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createServiceClient>>;

export type AutopilotTone =
  | "professional"
  | "casual"
  | "witty"
  | "promotional"
  | "educational";

/** Platforms autopilot can target — text-capable + publishable. NO instagram. */
export const AUTOPILOT_PLATFORMS = ["facebook", "linkedin", "threads"] as const;
export type AutopilotPlatform = (typeof AUTOPILOT_PLATFORMS)[number];

/** Per-platform char budgets (mirrors the composer). Threads is the tightest. */
const CHAR_LIMIT: Record<AutopilotPlatform, number> = {
  facebook: 63206,
  linkedin: 3000,
  threads: 500,
};

export type AutopilotSettings = {
  enabled: boolean;
  mode: "review" | "auto";
  postsPerWeek: number;
  postsPerDay: number | null;
  platforms: AutopilotPlatform[] | null;
  postDays: number[] | null;
  postHourUtc: number | null;
  tone: AutopilotTone;
};

export const DEFAULT_AUTOPILOT_SETTINGS: AutopilotSettings = {
  enabled: false,
  mode: "review",
  postsPerWeek: 3,
  postsPerDay: null,
  platforms: null,
  postDays: null,
  postHourUtc: null,
  tone: "professional",
};

type SettingsRow = {
  enabled?: boolean | null;
  mode?: string | null;
  posts_per_week?: number | null;
  posts_per_day?: number | null;
  platforms?: unknown;
  post_days?: unknown;
  post_hour_utc?: number | null;
  tone?: string | null;
  last_generated_week?: string | null;
};

const TONES: readonly AutopilotTone[] = [
  "professional",
  "casual",
  "witty",
  "promotional",
  "educational",
];

function coercePlatforms(v: unknown): AutopilotPlatform[] | null {
  if (!Array.isArray(v)) return null;
  const out = [...new Set(v)].filter((p): p is AutopilotPlatform =>
    (AUTOPILOT_PLATFORMS as readonly string[]).includes(p as string),
  );
  return out.length > 0 ? out : null;
}

function coerceDays(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out = [...new Set(v.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort(
    (a, b) => a - b,
  );
  return out.length > 0 ? out : null;
}

export function normalizeSettings(row: SettingsRow | null): AutopilotSettings {
  if (!row) return { ...DEFAULT_AUTOPILOT_SETTINGS };
  return {
    enabled: row.enabled === true,
    mode: row.mode === "auto" ? "auto" : "review",
    postsPerWeek: normalizePostsPerPeriod(row.posts_per_week),
    postsPerDay:
      typeof row.posts_per_day === "number" && row.posts_per_day >= 1 && row.posts_per_day <= 5
        ? row.posts_per_day
        : null,
    platforms: coercePlatforms(row.platforms),
    postDays: coerceDays(row.post_days),
    postHourUtc:
      typeof row.post_hour_utc === "number" && row.post_hour_utc >= 0 && row.post_hour_utc <= 23
        ? row.post_hour_utc
        : null,
    tone: TONES.includes(row.tone as AutopilotTone) ? (row.tone as AutopilotTone) : "professional",
  };
}

const SELECT_COLUMNS =
  "enabled, mode, posts_per_week, posts_per_day, platforms, post_days, post_hour_utc, tone, last_generated_week";

/** Read an org's autopilot settings (service-role, cron-safe). Never throws. */
export async function getAutopilotSettings(orgId: string): Promise<AutopilotSettings> {
  try {
    const db = await createServiceClient();
    const { data } = await db
      .from("org_social_autopilot")
      .select(SELECT_COLUMNS)
      .eq("organization_id", orgId)
      .maybeSingle();
    return normalizeSettings((data as SettingsRow | null) ?? null);
  } catch {
    return { ...DEFAULT_AUTOPILOT_SETTINGS };
  }
}

// ── Content generation ───────────────────────────────────────────────────────

/**
 * Rotating post angles. Autopilot without variety reads as a bot; cycling angles
 * (helpful → service → FAQ → differentiator → CTA) keeps a week from being five
 * variations of "book now".
 */
const ANGLES: readonly string[] = [
  "Share a genuinely useful tip a customer would thank you for.",
  "Highlight one of your services and who it's the perfect fit for.",
  "Answer a question customers commonly ask, in a helpful way.",
  "Share what makes this business different from the alternatives.",
  "Share a short, human behind-the-scenes note about the work.",
  "Warmly invite people to get in touch or book — no hard sell.",
];

/** Assemble an on-brand context string from the org's own data. */
async function buildBusinessContext(db: Db, orgId: string, orgName: string): Promise<string> {
  const lines: string[] = [`Business name: ${orgName}.`];
  try {
    const { data: kb } = await db
      .from("knowledge_base")
      .select("title, content")
      .eq("organization_id", orgId)
      .eq("active", true)
      .limit(6);
    for (const row of (kb ?? []) as { title?: string; content?: string }[]) {
      const c = (row.content ?? "").trim().slice(0, 400);
      if (c) lines.push(`- ${row.title ? `${row.title}: ` : ""}${c}`);
    }
  } catch {
    // knowledge_base is optional context
  }
  try {
    const { data: svc } = await db
      .from("appointment_types")
      .select("name, description")
      .eq("organization_id", orgId)
      .eq("active", true)
      .limit(8);
    const names = (svc ?? [])
      .map((s) => (s as { name?: string }).name)
      .filter(Boolean);
    if (names.length) lines.push(`Services offered: ${names.join(", ")}.`);
  } catch {
    // appointment_types is optional context
  }
  return lines.join("\n");
}

// ── The weekly run ───────────────────────────────────────────────────────────

/** Monday (00:00 UTC) of the current week, YYYY-MM-DD. */
export function currentWeekOf(now: Date = new Date()): string {
  const day = now.getUTCDay();
  const diff = (day + 6) % 7;
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff),
  );
  return monday.toISOString().slice(0, 10);
}

/** Which of this org's connected accounts autopilot can post to. */
async function connectedAutopilotPlatforms(
  db: Db,
  orgId: string,
): Promise<AutopilotPlatform[]> {
  const { data } = await db
    .from("org_oauth_tokens")
    .select("provider")
    .eq("organization_id", orgId);
  const providers = new Set(((data ?? []) as { provider: string }[]).map((r) => r.provider));
  const out: AutopilotPlatform[] = [];
  if (providers.has("meta")) out.push("facebook"); // IG excluded (needs an image)
  if (providers.has("linkedin")) out.push("linkedin");
  if (providers.has("threads")) out.push("threads");
  return out;
}

export type OrgGenerateResult = {
  generated: number;
  skipped?: "disabled" | "already_done" | "no_targets" | "no_time";
};

/**
 * Generate + queue this week's posts for one org. Idempotent per (org, week)
 * via `last_generated_week`. Returns how many social_posts rows were written.
 */
export async function generateWeekForOrg(
  db: Db,
  orgId: string,
  orgName: string,
  weekOf: string,
): Promise<OrgGenerateResult> {
  const settings = await getAutopilotSettings(orgId);
  if (!settings.enabled) return { generated: 0, skipped: "disabled" };

  // Idempotency: bail if this week was already generated.
  const { data: existing } = await db
    .from("org_social_autopilot")
    .select("last_generated_week")
    .eq("organization_id", orgId)
    .maybeSingle();
  if ((existing as { last_generated_week?: string } | null)?.last_generated_week === weekOf) {
    return { generated: 0, skipped: "already_done" };
  }

  // Targets: connected ∩ chosen (or all connected). Never Instagram.
  let targets = await connectedAutopilotPlatforms(db, orgId);
  if (settings.platforms) {
    targets = targets.filter((p) => settings.platforms!.includes(p));
  }
  if (targets.length === 0) return { generated: 0, skipped: "no_targets" };

  // Generate against the TIGHTEST target so the text fits every platform.
  const tightest = targets.reduce((a, b) => (CHAR_LIMIT[a] <= CHAR_LIMIT[b] ? a : b));

  const slots =
    settings.mode === "auto"
      ? planPublishTimes(weekOf, {
          count: settings.postsPerWeek,
          days: settings.postDays ?? undefined,
          maxPerDay: settings.postsPerDay ?? undefined,
          hourUtc: settings.postHourUtc ?? DEFAULT_PUBLISH_HOUR_UTC,
        })
      : [];

  const context = await buildBusinessContext(db, orgId, orgName);
  const nowIso = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];

  for (let i = 0; i < settings.postsPerWeek; i++) {
    const angle = ANGLES[i % ANGLES.length];
    const topic = `${angle}\n\nContext about the business you are posting as:\n${context}`;
    let content: string;
    try {
      content = await generateSocialPost(tightest, settings.tone, topic, orgName);
    } catch (e) {
      console.warn(`[social-autopilot] generation failed for org ${orgId}:`, e instanceof Error ? e.message : e);
      continue;
    }
    if (!content.trim()) continue;

    // One row per target platform, same copy. Auto → scheduled at the slot;
    // review → a plain draft for the human to schedule.
    const scheduledAt = settings.mode === "auto" ? (slots[i] ?? null) : null;
    for (const platform of targets) {
      rows.push({
        organization_id: orgId,
        platform,
        content,
        tone: settings.tone,
        status: settings.mode === "auto" && scheduledAt ? "scheduled" : "draft",
        scheduled_at: settings.mode === "auto" ? scheduledAt : null,
        generated_by_ai: true,
        ai_prompt: angle,
      });
    }
  }

  if (rows.length > 0) {
    const { error } = await db.from("social_posts").insert(rows);
    if (error) {
      console.warn(`[social-autopilot] insert failed for org ${orgId}:`, error.message);
      return { generated: 0 };
    }
  }

  // Stamp the week even if 0 rows (a generation outage shouldn't retry all week).
  await db
    .from("org_social_autopilot")
    .update({ last_generated_week: weekOf })
    .eq("organization_id", orgId);

  return { generated: rows.length };
}

/** Run the weekly generation for every org with autopilot enabled. */
export async function runWeeklyAutopilot(
  now: Date = new Date(),
): Promise<{ orgs: number; generated: number }> {
  const db = await createServiceClient();
  const weekOf = currentWeekOf(now);

  const { data: enabledRows } = await db
    .from("org_social_autopilot")
    .select("organization_id")
    .eq("enabled", true);
  const orgIds = ((enabledRows ?? []) as { organization_id: string }[]).map(
    (r) => r.organization_id,
  );
  if (orgIds.length === 0) return { orgs: 0, generated: 0 };

  const { data: orgs } = await db
    .from("organizations")
    .select("id, name")
    .in("id", orgIds);
  const nameById = new Map(
    ((orgs ?? []) as { id: string; name: string }[]).map((o) => [o.id, o.name]),
  );

  let generated = 0;
  for (const orgId of orgIds) {
    try {
      const res = await generateWeekForOrg(db, orgId, nameById.get(orgId) ?? "our business", weekOf);
      generated += res.generated;
    } catch (e) {
      console.warn(`[social-autopilot] org ${orgId} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return { orgs: orgIds.length, generated };
}
