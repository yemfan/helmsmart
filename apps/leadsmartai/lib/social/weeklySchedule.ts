import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import { getConnectedSocialAccounts, type ConnectedSocialAccount } from "@/lib/social/recommend";
import { renderCardPng, type BrandKit } from "@/lib/social/renderCard";
import { loadPresentationAgent } from "@/lib/presentations/loadPresentationAgent";
import { agentHasSocialCustomization } from "@/lib/social/customization";
import { getAgentAiSettings } from "@/lib/agent-ai/settings";

/**
 * Weekly social schedule. The agent checks weekdays; each checked day carries a
 * time-of-day, a content type (text or image), channels (empty = all connected),
 * and a topic. A cron (app/api/cron/weekly-social) fires due days, has Claude
 * RESEARCH the topic (web_search) and write a post, then enqueues it into
 * scheduled_posts — the existing publish cron delivers it.
 *
 * Text  posts → Facebook / LinkedIn / Threads.
 * Image posts → a branded card rendered from the topic, which additionally
 * unlocks Instagram + Pinterest (both require an image).
 * ('video' is reserved — a topic->video engine is a later step.)
 */

// ── Types + presets ──────────────────────────────────────────────────────────

export type MediaType = "text" | "image" | "video";

/** Publish targets a TEXT topic-post can go to (image optional there). */
export const TEXT_PLATFORMS = ["facebook", "linkedin", "threads"] as const;
/** Publish targets an IMAGE topic-post can go to (adds the image-required ones). */
export const IMAGE_PLATFORMS = ["facebook", "instagram", "linkedin", "threads", "pinterest"] as const;

/** Kept for import compatibility. */
export const WEEKLY_TEXT_PLATFORMS = TEXT_PLATFORMS;
export type WeeklyPlatform = (typeof IMAGE_PLATFORMS)[number];

export function platformsForMedia(mediaType: MediaType): readonly WeeklyPlatform[] {
  // 'video' has no generic engine yet — treat as text targets (won't post media).
  return mediaType === "image" ? IMAGE_PLATFORMS : TEXT_PLATFORMS;
}

function normalizeMediaType(v: unknown): MediaType {
  // 'video' is accepted by the column but not yet generatable — fold to text.
  return v === "image" ? "image" : "text";
}

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
  mediaType: MediaType;
  platforms: WeeklyPlatform[] | null; // null/empty = all connected of this media type
  topic: string;
};

type Row = {
  agent_id: number;
  weekday: number;
  enabled: boolean;
  post_hour: number;
  post_minute: number;
  timezone: string;
  media_type: string | null;
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
    mediaType: "text",
    platforms: null,
    topic: "",
  };
}

function rowToDay(r: Row): WeeklyScheduleDay {
  const mediaType = normalizeMediaType(r.media_type);
  const allowed = platformsForMedia(mediaType) as readonly string[];
  const platforms = Array.isArray(r.platforms)
    ? (r.platforms.filter((p): p is WeeklyPlatform => allowed.includes(p)) as WeeklyPlatform[])
    : null;
  return {
    weekday: r.weekday,
    enabled: Boolean(r.enabled),
    postHour: r.post_hour,
    postMinute: r.post_minute,
    timezone: r.timezone || "America/Los_Angeles",
    mediaType,
    platforms: platforms && platforms.length ? platforms : null,
    topic: r.topic ?? "",
  };
}

const SELECT_COLS =
  "agent_id, weekday, enabled, post_hour, post_minute, timezone, media_type, platforms, topic, last_fired_on";

/** All 7 days for an agent (defaults filled in for days with no row yet). */
export async function getWeeklySchedule(agentId: string): Promise<WeeklyScheduleDay[]> {
  const { data } = await supabaseAdmin
    .from("social_weekly_schedules")
    .select(SELECT_COLS)
    .eq("agent_id", agentId as never);
  const rows = (data as Row[] | null) ?? [];
  const byDay = new Map(rows.map((r) => [r.weekday, rowToDay(r)]));
  return Array.from({ length: 7 }, (_, wd) => byDay.get(wd) ?? defaultDay(wd));
}

/** Upsert the full week (one row per weekday). Editing a day clears its fired marker. */
export async function saveWeeklySchedule(agentId: string, days: WeeklyScheduleDay[]): Promise<void> {
  const nowIso = new Date().toISOString();
  const rows = days.slice(0, 7).map((d) => {
    const mediaType = normalizeMediaType(d.mediaType);
    const allowed = platformsForMedia(mediaType) as readonly string[];
    const platforms = d.platforms && d.platforms.length ? d.platforms.filter((p) => allowed.includes(p)) : null;
    return {
      agent_id: Number(agentId),
      weekday: d.weekday,
      enabled: Boolean(d.enabled),
      post_hour: Math.min(23, Math.max(0, Math.floor(d.postHour))),
      post_minute: Math.min(59, Math.max(0, Math.floor(d.postMinute))),
      timezone: d.timezone || "America/Los_Angeles",
      media_type: mediaType,
      platforms: platforms && platforms.length ? platforms : null,
      topic: (d.topic ?? "").slice(0, 300),
      // Editing resets the per-day fire marker so a changed time/topic can fire today.
      last_fired_on: null,
      updated_at: nowIso,
    };
  });
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

/**
 * Render a branded card for the post caption and upload it to the social-images
 * bucket, returning the public URL. Mirrors persistCardImages() in recommend.ts.
 * Returns null on any failure (the caller falls back to a text post).
 */
async function renderTopicCardUrl(agentId: string, caption: string): Promise<string | null> {
  try {
    const agent = await loadPresentationAgent(agentId).catch(() => null);
    let brandKit: BrandKit | undefined;
    try {
      if (await agentHasSocialCustomization(agentId)) {
        const settings = await getAgentAiSettings(agentId).catch(() => null);
        const color = settings?.brandColor ?? null;
        const logoUrl = agent?.logoUrl ?? null;
        if (color || logoUrl) brandKit = { color, logoUrl };
      }
    } catch {
      /* default card */
    }
    const png = await renderCardPng({ source_type: "timely", caption }, agent, null, brandKit);
    const path = `${agentId}/weekly-${crypto.randomUUID()}.png`;
    const { error } = await supabaseAdmin.storage
      .from("social-images")
      .upload(path, png, { contentType: "image/png", upsert: true });
    if (error) throw error;
    return supabaseAdmin.storage.from("social-images").getPublicUrl(path).data.publicUrl;
  } catch (e) {
    console.warn(`[weekly-social] card render failed (agent ${agentId}):`, e instanceof Error ? e.message : e);
    return null;
  }
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

/**
 * Publish targets an account maps to for a given media type. A meta account
 * covers Facebook and (when a business IG is linked) Instagram; the rest map 1:1.
 * Image-required targets (instagram, pinterest) only appear for image posts.
 */
function targetsForAccount(acct: ConnectedSocialAccount, mediaType: MediaType): WeeklyPlatform[] {
  if (mediaType === "image") {
    switch (acct.platform) {
      case "meta":
        return acct.ig_business_user_id ? ["facebook", "instagram"] : ["facebook"];
      case "linkedin":
        return ["linkedin"];
      case "threads":
        return ["threads"];
      case "pinterest":
        return ["pinterest"];
      default:
        return [];
    }
  }
  switch (acct.platform) {
    case "meta":
      return ["facebook"];
    case "linkedin":
      return ["linkedin"];
    case "threads":
      return ["threads"];
    default:
      return [];
  }
}

/**
 * Fire every due weekly slot: for each enabled row whose local weekday matches,
 * whose time has passed, and which hasn't fired yet today, research the topic +
 * write a post (rendering a branded card for image days) and enqueue one
 * scheduled_posts row per matching connected account/platform. Idempotent per day
 * via last_fired_on. Returns a summary for the cron.
 */
export async function runDueWeeklySlots(): Promise<{ fired: number; enqueued: number }> {
  const { data } = await supabaseAdmin
    .from("social_weekly_schedules")
    .select(SELECT_COLS)
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
    // double-post. Optimistic: only succeeds if last_fired_on is still what we read.
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
      const mediaType = normalizeMediaType(r.media_type);
      const post = await generatePostFromTopic(r.topic);
      if (!post) continue;
      fired += 1;

      // Render the branded card for image days (fall back to text on failure).
      let imageUrl: string | null = null;
      let effectiveMedia: MediaType = mediaType;
      if (mediaType === "image") {
        imageUrl = await renderTopicCardUrl(String(r.agent_id), post.caption);
        if (!imageUrl) effectiveMedia = "text"; // card failed → post as text
      }

      const accounts = await getConnectedSocialAccounts(String(r.agent_id));
      const wanted = r.platforms && r.platforms.length ? new Set(r.platforms) : null;
      const tagLine = post.hashtags.length ? post.hashtags.map((h) => `#${h}`).join(" ") : "";
      const caption = [post.caption, tagLine].filter(Boolean).join("\n\n");
      const nowIso = new Date().toISOString();

      const insertRows = accounts.flatMap((acct) =>
        targetsForAccount(acct, effectiveMedia)
          .filter((platform) => !wanted || wanted.has(platform))
          .map((platform) => ({
            agent_id: r.agent_id,
            social_account_id: acct.id,
            platform,
            caption,
            hashtags: post.hashtags,
            media_library_id: null,
            image_url: imageUrl,
            trigger_kind: "weekly_schedule",
            subject_kind: "weekly_schedule",
            subject_ref_id: null,
            status: "scheduled",
            scheduled_for: nowIso,
          })),
      );

      if (insertRows.length) {
        const { error } = await supabaseAdmin.from("scheduled_posts").insert(insertRows as never);
        if (!error) enqueued += insertRows.length;
        else console.warn(`[weekly-social] enqueue failed (agent ${r.agent_id}):`, error.message);
      }
    } catch (e) {
      console.warn(`[weekly-social] slot failed (agent ${r.agent_id}, wd ${r.weekday}):`, e instanceof Error ? e.message : e);
    }
  }

  return { fired, enqueued };
}
