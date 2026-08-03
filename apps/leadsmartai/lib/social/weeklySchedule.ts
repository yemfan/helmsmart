import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import { getConnectedSocialAccounts } from "@/lib/social/recommend";

/**
 * Weekly social schedule. The agent checks weekdays; each checked day carries a
 * time-of-day, channels (empty = all connected), and a topic. A cron
 * (app/api/cron/weekly-social) fires due days, has Claude RESEARCH the topic
 * (web_search) and write a post, then enqueues it into scheduled_posts — the
 * existing publish cron delivers it. Text posts, so the targets are the
 * text-capable platforms (Facebook, LinkedIn, Threads). Image/video platforms
 * (Instagram, Pinterest, TikTok, YouTube) need generated media — a later step.
 */

// ── Types + presets ──────────────────────────────────────────────────────────

/** Platforms a text topic-post can go to today (publishPost accepts text here). */
export const WEEKLY_TEXT_PLATFORMS = ["facebook", "linkedin", "threads"] as const;
export type WeeklyPlatform = (typeof WEEKLY_TEXT_PLATFORMS)[number];

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Prepopulated topic suggestions (agents can also type their own). */
export const TOPIC_PRESETS: readonly string[] = [
  "Local housing market update",
  "Home-buying tip of the week",
  "First-time buyer advice",
  "Neighborhood spotlight",
  "Mortgage & interest rate check-in",
  "Home-seller tip (staging, pricing)",
  "Open house invitation",
  "Client success story / testimonial angle",
  "Real estate myth, busted",
  "Seasonal home maintenance tip",
];

export type WeeklyScheduleDay = {
  weekday: number; // 0=Sun..6=Sat
  enabled: boolean;
  postHour: number; // 0-23 (local, in `timezone`)
  postMinute: number; // 0-59
  timezone: string;
  platforms: WeeklyPlatform[] | null; // null/empty = all connected
  topic: string;
};

type Row = {
  agent_id: number;
  weekday: number;
  enabled: boolean;
  post_hour: number;
  post_minute: number;
  timezone: string;
  platforms: string[] | null;
  topic: string;
  last_fired_on: string | null;
};

function defaultDay(weekday: number): WeeklyScheduleDay {
  return {
    weekday,
    enabled: false,
    postHour: 9,
    postMinute: 0,
    timezone: "America/Los_Angeles",
    platforms: null,
    topic: "",
  };
}

function rowToDay(r: Row): WeeklyScheduleDay {
  const platforms = Array.isArray(r.platforms)
    ? (r.platforms.filter((p): p is WeeklyPlatform =>
        (WEEKLY_TEXT_PLATFORMS as readonly string[]).includes(p),
      ) as WeeklyPlatform[])
    : null;
  return {
    weekday: r.weekday,
    enabled: Boolean(r.enabled),
    postHour: r.post_hour,
    postMinute: r.post_minute,
    timezone: r.timezone || "America/Los_Angeles",
    platforms: platforms && platforms.length ? platforms : null,
    topic: r.topic ?? "",
  };
}

/** All 7 days for an agent (defaults filled in for days with no row yet). */
export async function getWeeklySchedule(agentId: string): Promise<WeeklyScheduleDay[]> {
  const { data } = await supabaseAdmin
    .from("social_weekly_schedules")
    .select("agent_id, weekday, enabled, post_hour, post_minute, timezone, platforms, topic, last_fired_on")
    .eq("agent_id", agentId as never);
  const rows = (data as Row[] | null) ?? [];
  const byDay = new Map(rows.map((r) => [r.weekday, rowToDay(r)]));
  return Array.from({ length: 7 }, (_, wd) => byDay.get(wd) ?? defaultDay(wd));
}

/** Upsert the full week (one row per weekday). Editing a day clears its fired marker. */
export async function saveWeeklySchedule(agentId: string, days: WeeklyScheduleDay[]): Promise<void> {
  const nowIso = new Date().toISOString();
  const rows = days.slice(0, 7).map((d) => ({
    agent_id: Number(agentId),
    weekday: d.weekday,
    enabled: Boolean(d.enabled),
    post_hour: Math.min(23, Math.max(0, Math.floor(d.postHour))),
    post_minute: Math.min(59, Math.max(0, Math.floor(d.postMinute))),
    timezone: d.timezone || "America/Los_Angeles",
    platforms: d.platforms && d.platforms.length ? d.platforms : null,
    topic: (d.topic ?? "").slice(0, 300),
    // Editing resets the per-day fire marker so a changed time/topic can fire today.
    last_fired_on: null,
    updated_at: nowIso,
  }));
  const { error } = await supabaseAdmin
    .from("social_weekly_schedules")
    .upsert(rows as never, { onConflict: "agent_id,weekday" });
  if (error) throw new Error(error.message);
}

export function weeklyScheduleConfigured(): boolean {
  return isAnthropicConfigured();
}

// ── Topic → researched post (web_search) ─────────────────────────────────────

const MODEL = "claude-sonnet-4-6";
const WEB_SEARCH_MAX_USES = 3;
const MAX_TOOL_ROUNDS = 6;
const MAX_OUTPUT_TOKENS = 8000;

const SYSTEM_PROMPT =
  "You write ONE short, engaging social media post for a real estate agent, grounded in CURRENT facts you find via web_search. " +
  "Use web_search to check anything time-sensitive (rates, local market, news) so the post is accurate and timely — never invent stats. " +
  "Voice: warm, professional, first person, value-first (helpful, not salesy). No emojis-spam, no clickbait. " +
  'Return ONLY JSON: {"caption": string (2-4 short sentences, ready to post), "hashtags": string[] (3-6, no leading #)}.';

function extractJson(text: string): { caption?: unknown; hashtags?: unknown } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/** Research the topic and write a post. Returns null on any failure (cron-safe). */
export async function generatePostFromTopic(
  topic: string,
): Promise<{ caption: string; hashtags: string[] } | null> {
  if (!isAnthropicConfigured() || !topic.trim()) return null;
  const client = getAnthropicClient();
  const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: WEB_SEARCH_MAX_USES }];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    {
      role: "user",
      content:
        `Write today's social post on this topic: "${topic.trim()}". ` +
        "Search the web for anything current/local that makes it accurate and timely, then write the post.",
    },
  ];

  let finalText = "";
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await client.messages
        .stream({
          model: MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          thinking: { type: "adaptive" } as any,
          system: SYSTEM_PROMPT,
          messages,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tools: tools as any,
        })
        .finalMessage();

      const content: unknown[] = Array.isArray(res?.content) ? res.content : [];
      for (const block of content) {
        const b = block as { type?: string; text?: string };
        if (b.type === "text" && typeof b.text === "string") finalText += b.text;
      }
      if (res?.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: res.content });
        continue;
      }
      break;
    }
  } catch (e) {
    console.warn("[weekly-social] generation failed:", e instanceof Error ? e.message : e);
    return null;
  }

  const parsed = extractJson(finalText);
  const caption = typeof parsed?.caption === "string" ? parsed.caption.trim() : "";
  if (!caption) return null;
  const hashtags = Array.isArray(parsed?.hashtags)
    ? (parsed!.hashtags as unknown[])
        .filter((h): h is string => typeof h === "string")
        .map((h) => h.replace(/^#/, "").trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];
  return { caption: caption.slice(0, 1200), hashtags };
}

// ── Cron: fire the due days ──────────────────────────────────────────────────

const WD_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Local weekday (0-6), minutes-since-midnight, and YYYY-MM-DD in `tz`, right now. */
function localNow(tz: string): { weekday: number; minutes: number; date: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = WD_INDEX[get("weekday")] ?? 0;
  let hour = parseInt(get("hour"), 10) || 0;
  if (hour === 24) hour = 0; // some engines emit 24 at midnight
  const minutes = hour * 60 + (parseInt(get("minute"), 10) || 0);
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  return { weekday, minutes, date };
}

const PLATFORM_FOR_ACCOUNT: Record<string, WeeklyPlatform | null> = {
  meta: "facebook",
  linkedin: "linkedin",
  threads: "threads",
};

/**
 * Fire every due weekly slot: for each enabled row whose local weekday matches,
 * whose time has passed, and which hasn't fired yet today, research the topic +
 * write a post and enqueue one scheduled_posts row per matching connected
 * account. Idempotent per day via last_fired_on. Returns a summary for the cron.
 */
export async function runDueWeeklySlots(): Promise<{ fired: number; enqueued: number }> {
  const { data } = await supabaseAdmin
    .from("social_weekly_schedules")
    .select("agent_id, weekday, enabled, post_hour, post_minute, timezone, platforms, topic, last_fired_on")
    .eq("enabled", true as never);
  const rows = (data as Row[] | null) ?? [];

  let fired = 0;
  let enqueued = 0;

  for (const r of rows) {
    if (!r.topic?.trim()) continue;
    const tz = r.timezone || "America/Los_Angeles";
    const now = localNow(tz);
    if (now.weekday !== r.weekday) continue;
    if (now.minutes < r.post_hour * 60 + r.post_minute) continue;
    if (r.last_fired_on === now.date) continue; // already fired today

    // Claim the day up-front so a slow generate + a second cron tick don't
    // double-post. Optimistic: only succeeds if last_fired_on is still what we
    // read (null, or an earlier date).
    let claimQuery = supabaseAdmin
      .from("social_weekly_schedules")
      .update({ last_fired_on: now.date, updated_at: new Date().toISOString() } as never)
      .eq("agent_id", r.agent_id as never)
      .eq("weekday", r.weekday as never);
    claimQuery =
      r.last_fired_on === null
        ? claimQuery.is("last_fired_on", null)
        : claimQuery.eq("last_fired_on", r.last_fired_on as never);
    const { data: claimed } = await claimQuery.select("agent_id");
    if (!claimed || (claimed as unknown[]).length === 0) continue; // lost the race

    try {
      const post = await generatePostFromTopic(r.topic);
      if (!post) continue;
      fired += 1;

      const accounts = await getConnectedSocialAccounts(String(r.agent_id));
      const wanted = r.platforms && r.platforms.length ? new Set(r.platforms) : null;
      const tagLine = post.hashtags.length ? post.hashtags.map((h) => `#${h}`).join(" ") : "";
      const caption = [post.caption, tagLine].filter(Boolean).join("\n\n");
      const nowIso = new Date().toISOString();

      const insertRows = accounts
        .map((acct) => {
          const platform = PLATFORM_FOR_ACCOUNT[acct.platform] ?? null;
          if (!platform) return null; // image/video-only platform — skip for text posts
          if (wanted && !wanted.has(platform)) return null;
          return {
            agent_id: r.agent_id,
            social_account_id: acct.id,
            platform,
            caption,
            hashtags: post.hashtags,
            media_library_id: null,
            image_url: null,
            trigger_kind: "weekly_schedule",
            subject_kind: "weekly_schedule",
            subject_ref_id: null,
            status: "scheduled",
            scheduled_for: nowIso,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      if (insertRows.length) {
        const { error } = await supabaseAdmin
          .from("scheduled_posts")
          .insert(insertRows as never);
        if (!error) enqueued += insertRows.length;
        else console.warn(`[weekly-social] enqueue failed (agent ${r.agent_id}):`, error.message);
      }
    } catch (e) {
      console.warn(`[weekly-social] slot failed (agent ${r.agent_id}, wd ${r.weekday}):`, e instanceof Error ? e.message : e);
    }
  }

  return { fired, enqueued };
}
