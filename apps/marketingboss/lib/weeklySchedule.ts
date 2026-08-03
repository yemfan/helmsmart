import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { ANTHROPIC_API_URL, ANTHROPIC_MODEL, anthropicJson } from "@/lib/ai";
import { getConnectionStatuses } from "@/lib/social";
import { insertScheduledPost } from "@/lib/campaigns";

/**
 * Weekly social schedule (MarketingBoss). The user checks weekdays; each checked
 * day carries a time, channels (empty = all connected), and a topic. The
 * /api/cron/run tick fires due days: Claude RESEARCHES the topic (web tools) and
 * writes a post, then it's enqueued as a scheduled campaign_posts row — the cron's
 * drain phase publishes it. Mirrors the CloseBoss weekly schedule.
 *
 * Text posts, so the targets are the text-capable platforms (Facebook, Threads,
 * LinkedIn). Image/video platforms need generated media — a later step.
 */

export const WEEKLY_TEXT_PLATFORMS = ["facebook", "threads", "linkedin"] as const;
export type WeeklyPlatform = (typeof WEEKLY_TEXT_PLATFORMS)[number];

export const TOPIC_PRESETS: readonly string[] = [
  "Industry news & trends",
  "Product / service spotlight",
  "Customer success story angle",
  "Tip of the week for your audience",
  "Behind the scenes / how it's made",
  "A common myth in your industry, busted",
  "Seasonal promotion idea",
  "Q&A / FAQ from customers",
  "A quick how-to",
  "Motivational / value post",
];

export type WeeklyScheduleDay = {
  weekday: number;
  enabled: boolean;
  postHour: number;
  postMinute: number;
  timezone: string;
  channels: WeeklyPlatform[] | null; // null/empty = all connected
  topic: string;
};

type Row = {
  user_id: string;
  weekday: number;
  enabled: boolean;
  post_hour: number;
  post_minute: number;
  timezone: string;
  channels: string[] | null;
  topic: string;
  last_fired_on: string | null;
};

function defaultDay(weekday: number): WeeklyScheduleDay {
  return { weekday, enabled: false, postHour: 9, postMinute: 0, timezone: "America/Los_Angeles", channels: null, topic: "" };
}

function rowToDay(r: Row): WeeklyScheduleDay {
  const channels = Array.isArray(r.channels)
    ? (r.channels.filter((p): p is WeeklyPlatform =>
        (WEEKLY_TEXT_PLATFORMS as readonly string[]).includes(p),
      ) as WeeklyPlatform[])
    : null;
  return {
    weekday: r.weekday,
    enabled: Boolean(r.enabled),
    postHour: r.post_hour,
    postMinute: r.post_minute,
    timezone: r.timezone || "America/Los_Angeles",
    channels: channels && channels.length ? channels : null,
    topic: r.topic ?? "",
  };
}

export async function getWeeklySchedule(userId: string): Promise<WeeklyScheduleDay[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("weekly_schedules")
    .select("user_id, weekday, enabled, post_hour, post_minute, timezone, channels, topic, last_fired_on")
    .eq("user_id", userId);
  const rows = (data as Row[] | null) ?? [];
  const byDay = new Map(rows.map((r) => [r.weekday, rowToDay(r)]));
  return Array.from({ length: 7 }, (_, wd) => byDay.get(wd) ?? defaultDay(wd));
}

export async function saveWeeklySchedule(userId: string, days: WeeklyScheduleDay[]): Promise<void> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const rows = days.slice(0, 7).map((d) => ({
    user_id: userId,
    weekday: d.weekday,
    enabled: Boolean(d.enabled),
    post_hour: Math.min(23, Math.max(0, Math.floor(d.postHour))),
    post_minute: Math.min(59, Math.max(0, Math.floor(d.postMinute))),
    timezone: d.timezone || "America/Los_Angeles",
    channels: d.channels && d.channels.length ? d.channels : null,
    topic: (d.topic ?? "").slice(0, 300),
    last_fired_on: null, // editing resets so a changed time/topic can fire today
    updated_at: nowIso,
  }));
  const { error } = await admin.from("weekly_schedules").upsert(rows, { onConflict: "user_id,weekday" });
  if (error) throw new Error(error.message);
}

// ── Topic → researched post (web tools + structured JSON) ────────────────────

type Block = { type: string; text?: string };

/** Web-research the topic → free-form briefing (server web tools, pause_turn loop). */
async function researchTopic(topic: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const system =
    "You are a sharp social-media marketer. Research the given topic with the web so a post about it is accurate and timely — check anything current (news, data, seasonality). Be concrete.";
  const messages: { role: string; content: unknown }[] = [
    { role: "user", content: `Topic for today's social post: "${topic}". Research it, then note the 2-3 most postable, current angles.` },
  ];
  const tools = [
    { type: "web_search_20260209", name: "web_search", max_uses: 4 },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 2 },
  ];
  let text = "";
  for (let i = 0; i < 5; i++) {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 4000, system, messages, tools }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      content?: Block[];
      stop_reason?: string;
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(data.error?.message || `Research failed (${res.status}).`);
    text = (data.content ?? []).filter((b) => b.type === "text" && b.text).map((b) => b.text as string).join("\n\n");
    if (data.stop_reason === "pause_turn" && data.content) {
      messages.push({ role: "assistant", content: data.content });
      continue;
    }
    break;
  }
  return text;
}

const POST_SCHEMA = {
  type: "object",
  properties: {
    caption: { type: "string" },
    hashtags: { type: "array", items: { type: "string" } },
  },
  required: ["caption", "hashtags"],
  additionalProperties: false,
};

/** Research the topic and write a post. Returns null on failure (cron-safe). */
export async function generatePostFromTopic(topic: string): Promise<{ caption: string; hashtags: string[] } | null> {
  if (!process.env.ANTHROPIC_API_KEY || !topic.trim()) return null;
  try {
    const research = await researchTopic(topic.trim());
    const out = await anthropicJson<{ caption: string; hashtags: string[] }>({
      system:
        "You write ONE short, engaging social post from a research briefing. Value-first, natural voice, no clickbait. " +
        "caption: 2-4 short sentences ready to post. hashtags: 3-6 relevant tags without the # sign.",
      user: `Topic: ${topic}\n\nResearch briefing:\n${research.slice(0, 6000)}`,
      schema: POST_SCHEMA,
      maxTokens: 800,
    });
    const caption = (out?.caption ?? "").trim();
    if (!caption) return null;
    const hashtags = Array.isArray(out?.hashtags)
      ? out.hashtags.filter((h): h is string => typeof h === "string").map((h) => h.replace(/^#/, "").trim()).filter(Boolean).slice(0, 6)
      : [];
    return { caption: caption.slice(0, 1200), hashtags };
  } catch (e) {
    console.warn("[mkb weekly-social] generation failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

// ── Cron: fire due days ──────────────────────────────────────────────────────

const WD_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

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
  if (hour === 24) hour = 0;
  const minutes = hour * 60 + (parseInt(get("minute"), 10) || 0);
  return { weekday, minutes, date: `${get("year")}-${get("month")}-${get("day")}` };
}

/**
 * Fire every due weekly slot: research + write a post and enqueue it as a
 * scheduled campaign_posts row (drained + published by the cron's drain phase).
 * Idempotent per day via last_fired_on. Returns a summary.
 */
export async function runDueWeeklySlots(): Promise<{ fired: number; enqueued: number }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("weekly_schedules")
    .select("user_id, weekday, enabled, post_hour, post_minute, timezone, channels, topic, last_fired_on")
    .eq("enabled", true);
  const rows = (data as Row[] | null) ?? [];

  let fired = 0;
  let enqueued = 0;

  for (const r of rows) {
    if (!r.topic?.trim()) continue;
    const tz = r.timezone || "America/Los_Angeles";
    const now = localNow(tz);
    if (now.weekday !== r.weekday) continue;
    if (now.minutes < r.post_hour * 60 + r.post_minute) continue;
    if (r.last_fired_on === now.date) continue;

    // Optimistic claim (dedupe across ticks).
    let claim = admin
      .from("weekly_schedules")
      .update({ last_fired_on: now.date, updated_at: new Date().toISOString() })
      .eq("user_id", r.user_id)
      .eq("weekday", r.weekday);
    claim = r.last_fired_on === null ? claim.is("last_fired_on", null) : claim.eq("last_fired_on", r.last_fired_on);
    const { data: claimed } = await claim.select("user_id");
    if (!claimed || (claimed as unknown[]).length === 0) continue;

    try {
      const post = await generatePostFromTopic(r.topic);
      if (!post) continue;
      fired += 1;

      const statuses = await getConnectionStatuses(r.user_id, [...WEEKLY_TEXT_PLATFORMS]);
      const wanted = r.channels && r.channels.length ? new Set(r.channels) : null;
      const channels = WEEKLY_TEXT_PLATFORMS.filter(
        (p) => statuses[p]?.connected && (!wanted || wanted.has(p)),
      );
      if (channels.length === 0) continue;

      await insertScheduledPost(r.user_id, {
        type: "text",
        title: null,
        caption: post.caption,
        hashtags: post.hashtags,
        link: null,
        mediaUrl: null,
        perPlatform: {},
        channels,
        scheduledFor: new Date().toISOString(),
      });
      enqueued += channels.length;
    } catch (e) {
      console.warn(`[mkb weekly-social] slot failed (user ${r.user_id}, wd ${r.weekday}):`, e instanceof Error ? e.message : e);
    }
  }

  return { fired, enqueued };
}
