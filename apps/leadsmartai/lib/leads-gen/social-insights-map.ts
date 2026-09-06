import type { PostInsights } from "./meta-post";

/**
 * Pure mappers from each network's metric vocabulary onto `PostInsights`,
 * the one shape the cron, the Posts page and the Marketing Hub read. Kept
 * free of I/O (and of `server-only`) so they can be unit-tested; the
 * fetchers in social-insights.ts do the HTTP.
 */

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return null;
}

export const EMPTY_INSIGHTS: PostInsights = {
  likes: null,
  comments: null,
  shares: null,
  saves: null,
  impressions: null,
  reach: null,
  clicks: null,
  reactionsTotal: null,
};

function anyKnown(m: PostInsights): boolean {
  return Object.values(m).some((v) => v !== null);
}

/** YouTube `videos.list?part=statistics`: views → impressions. */
export function mapYouTubeStatistics(stats: unknown): PostInsights | null {
  if (!stats || typeof stats !== "object") return null;
  const s = stats as Record<string, unknown>;
  const m: PostInsights = {
    ...EMPTY_INSIGHTS,
    impressions: toNumber(s.viewCount),
    likes: toNumber(s.likeCount),
    comments: toNumber(s.commentCount),
  };
  m.reactionsTotal = m.likes;
  return anyKnown(m) ? m : null;
}

/** Threads `/insights`: `[{name, values:[{value}]}]` or `total_value.value` per metric. */
export function mapThreadsInsights(data: unknown): PostInsights | null {
  if (!Array.isArray(data)) return null;
  const by: Record<string, number | null> = {};
  for (const entry of data) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { name?: unknown; values?: { value?: unknown }[]; total_value?: { value?: unknown } };
    const name = typeof e.name === "string" ? e.name : "";
    const value = e.total_value?.value ?? e.values?.[0]?.value;
    if (name) by[name] = toNumber(value);
  }
  const reposts = by.reposts ?? null;
  const quotes = by.quotes ?? null;
  const m: PostInsights = {
    ...EMPTY_INSIGHTS,
    impressions: by.views ?? null,
    likes: by.likes ?? null,
    comments: by.replies ?? null,
    shares: reposts === null && quotes === null ? null : (reposts ?? 0) + (quotes ?? 0),
  };
  m.reactionsTotal = m.likes;
  return anyKnown(m) ? m : null;
}

/** TikTok `/v2/video/query/` video object. */
export function mapTikTokVideo(video: unknown): PostInsights | null {
  if (!video || typeof video !== "object") return null;
  const v = video as Record<string, unknown>;
  const m: PostInsights = {
    ...EMPTY_INSIGHTS,
    impressions: toNumber(v.view_count),
    likes: toNumber(v.like_count),
    comments: toNumber(v.comment_count),
    shares: toNumber(v.share_count),
  };
  m.reactionsTotal = m.likes;
  return anyKnown(m) ? m : null;
}
