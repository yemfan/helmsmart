import "server-only";
import { cachedSystem, markTranscriptCached } from "@leadsmart/shared/utils/promptCache";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import { getConnectedSocialAccounts, type ConnectedSocialAccount } from "@/lib/social/recommend";
import { renderCardPng, type BrandKit } from "@/lib/social/renderCard";
import { loadPresentationAgent } from "@/lib/presentations/loadPresentationAgent";
import { agentHasSocialCustomization } from "@/lib/social/customization";
import { getAgentAiSettings } from "@/lib/agent-ai/settings";
import { draftAvatarScript, getAvatarState, renderAvatarVideo } from "@/lib/agent/avatarStudio";
import { scheduleReel, type ReelPlatform } from "@/lib/social/scheduleReel";
import {
  clampPostsPerDay,
  defaultAiSlotTimes,
  fixedSlotTimes,
  planSlotTimes,
} from "@/lib/social/planWeeklySlot";
import { agentUiLocale } from "@/lib/i18n/agentLocale";

/**
 * Weekly social schedule. The agent checks weekdays; each checked day carries a
 * time-of-day, a content type (text / image / video), channels (empty = all
 * connected), and a topic. A cron (app/api/cron/weekly-social) fires due days,
 * has Claude RESEARCH the topic (web_search) and write a post, then enqueues it.
 *
 * Text  posts → Facebook / LinkedIn / Threads.
 * Image posts → a branded card rendered from the topic, which additionally
 * unlocks Instagram + Pinterest (both require an image).
 * Video posts → a talking-avatar clip of the agent (digital twin) delivering the
 * topic, fanned out to Facebook / Instagram / LinkedIn / TikTok / YouTube via the
 * reel pipeline. Requires the agent's digital twin (intro video + cloned voice).
 */

// ── Types + presets ──────────────────────────────────────────────────────────

export type MediaType = "text" | "image" | "video";

/** Publish targets a TEXT topic-post can go to (image optional there). */
export const TEXT_PLATFORMS = ["facebook", "linkedin", "threads"] as const;
/** Publish targets an IMAGE topic-post can go to (adds the image-required ones). */
export const IMAGE_PLATFORMS = ["facebook", "instagram", "linkedin", "threads", "pinterest"] as const;
/** Publish targets a VIDEO topic-post can go to (the reel pipeline's platforms). */
export const VIDEO_PLATFORMS = ["facebook", "instagram", "linkedin", "tiktok", "youtube"] as const;

/** Kept for import compatibility. */
export const WEEKLY_TEXT_PLATFORMS = TEXT_PLATFORMS;
export type WeeklyPlatform = (typeof IMAGE_PLATFORMS)[number] | (typeof VIDEO_PLATFORMS)[number];

export function platformsForMedia(mediaType: MediaType): readonly WeeklyPlatform[] {
  return mediaType === "video" ? VIDEO_PLATFORMS : mediaType === "image" ? IMAGE_PLATFORMS : TEXT_PLATFORMS;
}

function normalizeMediaType(v: unknown): MediaType {
  return v === "image" || v === "video" ? v : "text";
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

/** Where a slot's publish times come from. */
export type TimeMode = "fixed" | "ai";
/** Where a slot's subject comes from. */
export type TopicMode = "fixed" | "ai";

export type WeeklyScheduleDay = {
  weekday: number; // 0=Sun..6=Sat
  enabled: boolean;
  postHour: number; // 0-23 (local, in `timezone`) - the FIRST post when timeMode is "fixed"
  postMinute: number; // 0-59
  timezone: string;
  mediaType: MediaType;
  platforms: WeeklyPlatform[] | null; // null/empty = all connected of this media type
  topic: string;
  /** How many posts this weekday produces (1-5), spread across the day. */
  postsPerDay: number;
  /** "ai" ignores postHour/postMinute and lets the planner choose. */
  timeMode: TimeMode;
  /** "ai" ignores `topic` and lets the generator choose a timely one. */
  topicMode: TopicMode;
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
  posts_per_day: number | null;
  time_mode: string | null;
  topic_mode: string | null;
  fired_count_on: number | null;
};

function normalizeTimeMode(v: unknown): TimeMode {
  return v === "ai" ? "ai" : "fixed";
}

function normalizeTopicMode(v: unknown): TopicMode {
  return v === "ai" ? "ai" : "fixed";
}

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
    postsPerDay: 1,
    timeMode: "fixed",
    topicMode: "fixed",
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
    postsPerDay: clampPostsPerDay(r.posts_per_day ?? 1),
    timeMode: normalizeTimeMode(r.time_mode),
    topicMode: normalizeTopicMode(r.topic_mode),
  };
}

const SELECT_COLS =
  "agent_id, weekday, enabled, post_hour, post_minute, timezone, media_type, platforms, topic, " +
  "last_fired_on, posts_per_day, time_mode, topic_mode, fired_count_on";

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
      posts_per_day: clampPostsPerDay(d.postsPerDay),
      time_mode: normalizeTimeMode(d.timeMode),
      topic_mode: normalizeTopicMode(d.topicMode),
      // Editing resets the per-day fire markers so a changed time/topic/count
      // can fire today. Both must reset together or the new count is measured
      // against posts the old settings already produced.
      last_fired_on: null,
      fired_count_on: 0,
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

/**
 * The instruction handed to the generator when the agent chose "let AI pick
 * the topic". Everything else about the call is identical, so an AI-topic post
 * is researched and written exactly the way a typed-topic one is.
 */
const AI_TOPIC_DIRECTIVE =
  "Choose the topic yourself: search the web for what is genuinely timely and useful " +
  "for a residential real-estate audience this week - rates, local market movement, a " +
  "seasonal concern, a common buyer or seller question - and write today's post on it. " +
  "Pick something an agent could post without it reading as generic filler.";

/** Research the topic and write a post. Returns null on any failure (cron-safe). */
export async function generatePostFromTopic(
  topic: string,
  /** When true, the AI chooses the subject and `topic` is ignored. */
  aiChoosesTopic = false,
): Promise<{ caption: string; hashtags: string[] } | null> {
  if (!isAnthropicConfigured()) return null;
  if (!aiChoosesTopic && !topic.trim()) return null;
  const client = getAnthropicClient();
  const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: WEB_SEARCH_MAX_USES }];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    {
      role: "user",
      content: aiChoosesTopic
        ? AI_TOPIC_DIRECTIVE
        : `Write today's social post on this topic: "${topic.trim()}". ` +
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
          // Cached — identical every call, and the cached prefix covers the tools
        // sent ahead of it. See @leadsmart/shared/utils/promptCache.
        system: cachedSystem(SYSTEM_PROMPT) as never,
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
        // That turn holds the search results; move the breakpoint onto it
        // so the next round reads them from cache instead of re-paying.
        markTranscriptCached(messages as never);
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

const REEL_PLATFORMS = new Set<string>(["facebook", "instagram", "linkedin", "tiktok", "youtube"]);

/**
 * Video slot: render a talking-avatar clip (the agent's digital twin delivering
 * the topic) and enqueue it to the connected video platforms via the reel
 * pipeline. Requires the twin to be set up (intro video + cloned voice) — returns
 * 0 (a logged skip) when it isn't. Returns how many posts were queued.
 */
async function enqueueTopicVideo(
  agentId: string,
  topic: string,
  post: { caption: string; hashtags: string[] },
  wantedPlatforms: string[] | null,
): Promise<number> {
  const state = await getAvatarState(agentId);
  if (!state.configured || !state.hasIntroVideo || !state.voiceReady) {
    console.warn(`[weekly-social] video slot skipped for agent ${agentId} — digital twin not ready`);
    return 0;
  }
  try {
    // Ground the spoken script in the researched post so it reflects current facts.
    const script = await draftAvatarScript(agentId, `${topic}\n\nKey points to cover: ${post.caption}`);
    if (!script.trim()) return 0;
    const { videoUrl } = await renderAvatarVideo(agentId, script, null);

    const tagLine = post.hashtags.length ? post.hashtags.map((h) => `#${h}`).join(" ") : "";
    const caption = [post.caption, tagLine].filter(Boolean).join("\n\n");
    const { data: reelRow, error } = await supabaseAdmin
      .from("social_reels")
      .insert({
        agent_id: Number(agentId),
        slides: [],
        caption,
        hashtags: post.hashtags,
        mp4_url: videoUrl,
        status: "rendered",
      } as never)
      .select("id")
      .single();
    if (error || !reelRow) {
      console.warn(`[weekly-social] reel insert failed for agent ${agentId}:`, error?.message);
      return 0;
    }

    const allow =
      wantedPlatforms && wantedPlatforms.length
        ? (wantedPlatforms.filter((p): p is ReelPlatform => REEL_PLATFORMS.has(p)) as ReelPlatform[])
        : undefined;
    const res = await scheduleReel({
      agentId,
      reelId: (reelRow as { id: string }).id,
      platforms: allow,
      queueStatus: "scheduled",
    });
    if (res.error) console.warn(`[weekly-social] reel schedule for agent ${agentId}: ${res.error}`);
    return res.scheduled;
  } catch (e) {
    console.warn(`[weekly-social] video slot failed for agent ${agentId}:`, e instanceof Error ? e.message : e);
    return 0;
  }
}

/**
 * Fire every due weekly slot: for each enabled row whose local weekday matches,
 * whose time has passed, and which hasn't fired yet today, research the topic +
 * write a post (a branded card for image days, a talking-avatar clip for video
 * days) and enqueue it. Idempotent per day via last_fired_on. Returns a summary.
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
    const topicMode = normalizeTopicMode(r.topic_mode);
    // A blank topic is only legal when the AI is choosing one.
    if (topicMode === "fixed" && !r.topic?.trim()) continue;

    const tz = r.timezone || "America/Los_Angeles";
    const now = localNow(tz);
    if (now.weekday !== r.weekday) continue;

    const postsPerDay = clampPostsPerDay(r.posts_per_day ?? 1);
    // How many this slot has already produced TODAY. A stale marker from an
    // earlier date counts as zero rather than blocking the day.
    const firedToday = r.last_fired_on === now.date ? Math.max(0, r.fired_count_on ?? 0) : 0;
    if (firedToday >= postsPerDay) continue;

    // The publish times for this weekday. Fixed mode anchors on the agent's
    // chosen time; AI mode asks the planner (which falls back to engagement
    // windows if it cannot be reached, so this never returns empty).
    const timeMode = normalizeTimeMode(r.time_mode);
    const slotTimes =
      timeMode === "ai"
        ? await planSlotTimes({
            locale: await agentUiLocale(String(r.agent_id)),
            weekdayLabel: WEEKDAY_LABELS[r.weekday] ?? "today",
            postsPerDay,
            platforms: r.platforms ?? platformsForMedia(normalizeMediaType(r.media_type)),
          }).catch(() => defaultAiSlotTimes(postsPerDay))
        : fixedSlotTimes(r.post_hour * 60 + r.post_minute, postsPerDay);

    // Due when the time for the NEXT unfired post has passed. Indexing by
    // firedToday means a cron outage catches up one post per tick rather than
    // dumping the whole day at once.
    const dueAt = slotTimes[Math.min(firedToday, slotTimes.length - 1)];
    if (dueAt === undefined || now.minutes < dueAt) continue;

    // Claim this post up-front so a slow generate plus a second cron tick
    // cannot double-post. Optimistic: the update only lands if the counter is
    // still what we read, so whichever tick gets there first wins.
    let claimQuery = supabaseAdmin
      .from("social_weekly_schedules")
      .update({
        last_fired_on: now.date,
        fired_count_on: firedToday + 1,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("agent_id", r.agent_id as never)
      .eq("weekday", r.weekday as never)
      // Match the counter we READ, not the one we derived: on a stale date the
      // stored value is yesterday's count while firedToday is 0.
      .eq("fired_count_on", (r.fired_count_on ?? 0) as never);
    claimQuery =
      r.last_fired_on === null
        ? claimQuery.is("last_fired_on", null)
        : claimQuery.eq("last_fired_on", r.last_fired_on as never);
    const { data: claimed } = await claimQuery.select("agent_id");
    if (!claimed || (claimed as unknown[]).length === 0) continue; // lost the race

    try {
      const mediaType = normalizeMediaType(r.media_type);
      const post = await generatePostFromTopic(r.topic, topicMode === "ai");
      if (!post) continue;
      fired += 1;

      // Video days render a talking-avatar clip and fan out via the reel pipeline.
      if (mediaType === "video") {
        // With an AI-chosen topic there is no typed subject to script from, so
        // the researched caption becomes the subject.
        const videoTopic = r.topic?.trim() || post.caption;
        enqueued += await enqueueTopicVideo(String(r.agent_id), videoTopic, post, r.platforms);
        continue;
      }

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
