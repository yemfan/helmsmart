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
import { renderAndUploadScamAd } from "@/lib/social/adStorage";
import { pickScamTree } from "@/lib/social/scamTrees";
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
  /** weekday (0=Sun..6=Sat, as string) -> topic. Non-empty drives the schedule. */
  dayTopics: Record<string, string>;
  /** Optional image-ad template (e.g. "scam_decision_tree"). null = text posts. */
  adTemplate: string | null;
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
  dayTopics: {},
  adTemplate: null,
};

/** Predefined topics offered in the UI combo (the owner can also type anything). */
export const PREDEFINED_TOPICS = [
  "service",
  "product",
  "customers",
  "economy",
  "local market",
] as const;

/** The topic a day defaults to when it's first ticked. */
export const DEFAULT_DAY_TOPIC = "service";

type SettingsRow = {
  enabled?: boolean | null;
  mode?: string | null;
  posts_per_week?: number | null;
  posts_per_day?: number | null;
  platforms?: unknown;
  post_days?: unknown;
  post_hour_utc?: number | null;
  tone?: string | null;
  day_topics?: unknown;
  ad_template?: string | null;
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

function coerceDayTopics(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const dow = Number(k);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) continue;
    const s = typeof val === "string" ? val.trim().slice(0, 120) : "";
    if (s) out[String(dow)] = s;
  }
  return out;
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
    dayTopics: coerceDayTopics(row.day_topics),
    adTemplate:
      typeof row.ad_template === "string" && row.ad_template.trim() ? row.ad_template.trim() : null,
  };
}

const SELECT_COLUMNS =
  "enabled, mode, posts_per_week, posts_per_day, platforms, post_days, post_hour_utc, tone, day_topics, ad_template, last_generated_week";

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

/** Turn a per-day topic (predefined or free text) into a generation instruction. */
const TOPIC_HINTS: Record<string, string> = {
  service: "Highlight one of the business's services and who it's the perfect fit for.",
  product: "Highlight one of the business's products and the concrete benefit it delivers.",
  customers:
    "Share a warm, customer-focused message — a helpful tip, genuine appreciation, or a common question answered.",
  economy:
    "Share a brief, useful, non-alarmist take on the wider economy that's relevant to the business's customers.",
  "local market": "Share a genuine, specific insight about the local market the business serves.",
};

function topicInstruction(value: string): string {
  const key = value.trim().toLowerCase();
  return TOPIC_HINTS[key] ?? `Write an engaging, on-brand post about: ${value.trim()}.`;
}

/**
 * The publish time for a specific weekday within the week. Past times collapse
 * to `now` (a mid-week run must never drop a day's post for being in the past).
 */
function slotForWeekday(weekOf: string, dow: number, hourUtc: number, now: Date): string {
  const base = new Date(`${weekOf}T00:00:00Z`); // Monday (getUTCDay() === 1)
  const offset = (dow - base.getUTCDay() + 7) % 7;
  const d = new Date(base);
  d.setUTCDate(base.getUTCDate() + offset);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return (d.getTime() < now.getTime() ? now : d).toISOString();
}

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

  const now = new Date();
  const hour = settings.postHourUtc ?? DEFAULT_PUBLISH_HOUR_UTC;
  const auto = settings.mode === "auto";

  // Build the list of posts to make. Two modes:
  //   - Per-day topics set → one post per selected weekday, on that day, with
  //     that day's topic. This is what the day picker drives.
  //   - Otherwise → the older N-per-week spread with rotating angles.
  type Job = { instruction: string; scheduledAt: string | null };
  const jobs: Job[] = [];
  const selectedDays = Object.keys(settings.dayTopics)
    .map(Number)
    .filter((d) => d >= 0 && d <= 6)
    .sort((a, b) => a - b);

  if (selectedDays.length > 0) {
    for (const dow of selectedDays) {
      jobs.push({
        instruction: topicInstruction(settings.dayTopics[String(dow)]),
        scheduledAt: auto ? slotForWeekday(weekOf, dow, hour, now) : null,
      });
    }
  } else {
    const slots = auto
      ? planPublishTimes(weekOf, {
          count: settings.postsPerWeek,
          days: settings.postDays ?? undefined,
          maxPerDay: settings.postsPerDay ?? undefined,
          hourUtc: hour,
        })
      : [];
    for (let i = 0; i < settings.postsPerWeek; i++) {
      jobs.push({
        instruction: ANGLES[i % ANGLES.length],
        scheduledAt: auto ? (slots[i] ?? null) : null,
      });
    }
  }

  // Image-ad mode (e.g. AVASC's scam decision trees): each post is a branded
  // image + its own caption, rotating templates, instead of the text drafter.
  const adMode = settings.adTemplate === "scam_decision_tree";
  const context = adMode ? "" : await buildBusinessContext(db, orgId, orgName);
  const weekSeed = Number.parseInt(weekOf.replace(/-/g, ""), 10) || 0;
  const rows: Record<string, unknown>[] = [];

  for (let j = 0; j < jobs.length; j++) {
    const job = jobs[j];
    let content: string;
    let mediaUrl: string | null = null;

    if (adMode) {
      // Rotate through the scam types so a week isn't five of the same card.
      const tree = pickScamTree(weekSeed + j);
      content = tree.caption;
      try {
        mediaUrl = await renderAndUploadScamAd(db, orgId, tree, weekOf);
      } catch (e) {
        console.warn(`[social-autopilot] ad render failed for org ${orgId}:`, e instanceof Error ? e.message : e);
        // Fall through: still post the caption as text rather than nothing.
      }
    } else {
      const topic = `${job.instruction}\n\nContext about the business you are posting as:\n${context}`;
      try {
        content = await generateSocialPost(tightest, settings.tone, topic, orgName);
      } catch (e) {
        console.warn(`[social-autopilot] generation failed for org ${orgId}:`, e instanceof Error ? e.message : e);
        continue;
      }
      if (!content.trim()) continue;
    }

    // One row per target platform, same copy. Auto → scheduled at the slot;
    // review → a plain draft for the human to schedule.
    for (const platform of targets) {
      rows.push({
        organization_id: orgId,
        platform,
        content,
        tone: settings.tone,
        status: auto && job.scheduledAt ? "scheduled" : "draft",
        scheduled_at: auto ? job.scheduledAt : null,
        generated_by_ai: true,
        ai_prompt: adMode ? "scam decision-tree ad" : job.instruction.slice(0, 200),
        media_url: mediaUrl,
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
