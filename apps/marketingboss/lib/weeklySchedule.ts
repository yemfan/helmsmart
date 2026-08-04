import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { ANTHROPIC_API_URL, ANTHROPIC_MODEL, anthropicJson } from "@/lib/ai";
import { getConnectionStatuses } from "@/lib/social";
import { insertScheduledPost } from "@/lib/campaigns";
import { generatePostMediaAdmin } from "@/lib/generation";

/**
 * Weekly social schedule (MarketingBoss). The user checks weekdays; each checked
 * day carries a time, a content type (text / image / video), channels (empty =
 * all connected of that type), and a topic. The /api/cron/run tick fires due
 * days: Claude RESEARCHES the topic (web tools) and writes a post; for image /
 * video days it also generates the media on fal.ai (credit-metered). The post is
 * enqueued as a scheduled campaign_posts row — the cron's drain phase publishes it.
 *
 * Text  → Facebook / Threads / LinkedIn
 * Image → + Instagram / Pinterest
 * Video → YouTube / TikTok
 */

export type MediaType = "text" | "image" | "video";

export const TEXT_PLATFORMS = ["facebook", "threads", "linkedin"] as const;
export const IMAGE_PLATFORMS = ["facebook", "instagram", "threads", "linkedin", "pinterest"] as const;
export const VIDEO_PLATFORMS = ["youtube", "tiktok"] as const;
export const ALL_PLATFORMS = [
  "facebook",
  "instagram",
  "threads",
  "linkedin",
  "pinterest",
  "youtube",
  "tiktok",
] as const;
export type WeeklyPlatform = (typeof ALL_PLATFORMS)[number];

/** Kept for import compatibility (route/tests). Text targets are the base case. */
export const WEEKLY_TEXT_PLATFORMS = TEXT_PLATFORMS;

export function platformsForMedia(mediaType: MediaType): readonly WeeklyPlatform[] {
  return mediaType === "video" ? VIDEO_PLATFORMS : mediaType === "image" ? IMAGE_PLATFORMS : TEXT_PLATFORMS;
}

function normalizeMediaType(v: unknown): MediaType {
  return v === "image" || v === "video" ? v : "text";
}

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
  mediaType: MediaType;
  channels: WeeklyPlatform[] | null; // null/empty = all connected of this media type
  topic: string;
};

type Row = {
  user_id: string;
  weekday: number;
  enabled: boolean;
  post_hour: number;
  post_minute: number;
  timezone: string;
  media_type: string | null;
  channels: string[] | null;
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
    mediaType: "text",
    channels: null,
    topic: "",
  };
}

function rowToDay(r: Row): WeeklyScheduleDay {
  const mediaType = normalizeMediaType(r.media_type);
  const allowed = platformsForMedia(mediaType) as readonly string[];
  const channels = Array.isArray(r.channels)
    ? (r.channels.filter((p): p is WeeklyPlatform => allowed.includes(p)) as WeeklyPlatform[])
    : null;
  return {
    weekday: r.weekday,
    enabled: Boolean(r.enabled),
    postHour: r.post_hour,
    postMinute: r.post_minute,
    timezone: r.timezone || "America/Los_Angeles",
    mediaType,
    channels: channels && channels.length ? channels : null,
    topic: r.topic ?? "",
  };
}

const SELECT_COLS =
  "user_id, weekday, enabled, post_hour, post_minute, timezone, media_type, channels, topic, last_fired_on";

export async function getWeeklySchedule(userId: string): Promise<WeeklyScheduleDay[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("weekly_schedules").select(SELECT_COLS).eq("user_id", userId);
  const rows = (data as Row[] | null) ?? [];
  const byDay = new Map(rows.map((r) => [r.weekday, rowToDay(r)]));
  return Array.from({ length: 7 }, (_, wd) => byDay.get(wd) ?? defaultDay(wd));
}

export async function saveWeeklySchedule(userId: string, days: WeeklyScheduleDay[]): Promise<void> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const rows = days.slice(0, 7).map((d) => {
    const mediaType = normalizeMediaType(d.mediaType);
    const allowed = platformsForMedia(mediaType) as readonly string[];
    const channels = d.channels && d.channels.length ? d.channels.filter((c) => allowed.includes(c)) : null;
    return {
      user_id: userId,
      weekday: d.weekday,
      enabled: Boolean(d.enabled),
      post_hour: Math.min(23, Math.max(0, Math.floor(d.postHour))),
      post_minute: Math.min(59, Math.max(0, Math.floor(d.postMinute))),
      timezone: d.timezone || "America/Los_Angeles",
      media_type: mediaType,
      channels: channels && channels.length ? channels : null,
      topic: (d.topic ?? "").slice(0, 300),
      last_fired_on: null, // editing resets so a changed time/topic can fire today
      updated_at: nowIso,
    };
  });
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
    {
      role: "user",
      content: `Topic for today's social post: "${topic}". Research it, then note the 2-3 most postable, current angles.`,
    },
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
    mediaPrompt: { type: "string" },
  },
  required: ["caption", "hashtags"],
  additionalProperties: false,
};

export type GeneratedPost = { caption: string; hashtags: string[]; mediaPrompt: string };

/** Research the topic and write a post (+ a media prompt for image/video days). Null on failure (cron-safe). */
export async function generatePostFromTopic(topic: string, mediaType: MediaType = "text"): Promise<GeneratedPost | null> {
  if (!process.env.ANTHROPIC_API_KEY || !topic.trim()) return null;
  const wantsMedia = mediaType !== "text";
  try {
    const research = await researchTopic(topic.trim());
    const out = await anthropicJson<{ caption: string; hashtags: string[]; mediaPrompt?: string }>({
      system:
        "You write ONE short, engaging social post from a research briefing. Value-first, natural voice, no clickbait. " +
        "caption: 2-4 short sentences ready to post. hashtags: 3-6 relevant tags without the # sign." +
        (wantsMedia
          ? ` mediaPrompt: a vivid, concrete ${mediaType}-generation prompt (subject, setting, style, lighting, mood) that illustrates the post. No text overlays, no watermarks, no logos.`
          : ""),
      user: `Topic: ${topic}\nContent type: ${mediaType}\n\nResearch briefing:\n${research.slice(0, 6000)}`,
      schema: POST_SCHEMA,
      maxTokens: 900,
    });
    const caption = (out?.caption ?? "").trim();
    if (!caption) return null;
    const hashtags = Array.isArray(out?.hashtags)
      ? out.hashtags.filter((h): h is string => typeof h === "string").map((h) => h.replace(/^#/, "").trim()).filter(Boolean).slice(0, 6)
      : [];
    const mediaPrompt = typeof out?.mediaPrompt === "string" ? out.mediaPrompt.trim() : "";
    return { caption: caption.slice(0, 1200), hashtags, mediaPrompt };
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
 * Fire every due weekly slot: research + write a post (and generate image/video
 * media for non-text days), then enqueue it as a scheduled campaign_posts row
 * (drained + published by the cron's drain phase). Idempotent per day via
 * last_fired_on. Returns a summary.
 */
export async function runDueWeeklySlots(): Promise<{ fired: number; enqueued: number }> {
  const admin = createAdminClient();
  const { data } = await admin.from("weekly_schedules").select(SELECT_COLS).eq("enabled", true);
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
      const mediaType = normalizeMediaType(r.media_type);
      const post = await generatePostFromTopic(r.topic, mediaType);
      if (!post) continue;
      fired += 1;

      const allowed = platformsForMedia(mediaType);
      const statuses = await getConnectionStatuses(r.user_id, [...allowed]);
      const wanted = r.channels && r.channels.length ? new Set(r.channels) : null;
      const channels = allowed.filter((p) => statuses[p]?.connected && (!wanted || wanted.has(p)));
      if (channels.length === 0) continue;

      // Generate the media for image / video days (credit-metered; skip on shortfall).
      let mediaUrl: string | null = null;
      if (mediaType !== "text") {
        if (!post.mediaPrompt) continue;
        try {
          const g = await generatePostMediaAdmin(admin, r.user_id, null, 0, mediaType, post.mediaPrompt);
          mediaUrl = g.url;
        } catch (e) {
          console.warn(`[mkb weekly-social] media gen failed (user ${r.user_id}, wd ${r.weekday}):`, e instanceof Error ? e.message : e);
          continue;
        }
      }

      const tagLine = post.hashtags.length ? post.hashtags.map((h) => `#${h}`).join(" ") : "";
      const caption = [post.caption, tagLine].filter(Boolean).join("\n\n");
      // Populate per_platform so the drain phase (which targets per_platform keys) publishes.
      const perPlatform = Object.fromEntries(channels.map((c) => [c, caption]));

      await insertScheduledPost(r.user_id, {
        type: mediaType,
        title: null,
        caption,
        hashtags: post.hashtags,
        link: null,
        mediaUrl,
        perPlatform,
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
