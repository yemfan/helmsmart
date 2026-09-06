import "server-only";

import type { PostInsights } from "./meta-post";
import { mapThreadsInsights, mapTikTokVideo, mapYouTubeStatistics } from "./social-insights-map";

/**
 * Post metrics for the networks that were never measured: YouTube, Threads
 * and TikTok. Each maps its own vocabulary onto the one `PostInsights`
 * shape the cron, the Posts page and the Marketing Hub already read, so a
 * YouTube view lands in `impressions` beside a Facebook impression.
 *
 * What each network can say:
 *
 *   YouTube  views, likes, comments — videos.list?part=statistics, with the
 *            youtube.readonly scope the connect flow already requests.
 *   Threads  views, likes, replies, reposts, quotes — /{media}/insights,
 *            needs `threads_manage_insights` (added to the connect scopes).
 *   TikTok   views, likes, comments, shares — /v2/video/query/, needs
 *            `video.list` (added). The publish flow stores a publish_id,
 *            not a video id, so the status endpoint is asked for the public
 *            id first; a video still processing has no metrics yet.
 *
 * The mappers live in social-insights-map.ts (pure, tested); this file does
 * the HTTP.
 */

export { mapThreadsInsights, mapTikTokVideo, mapYouTubeStatistics } from "./social-insights-map";

// ── YouTube ──────────────────────────────────────────────────────────────

export async function fetchYouTubeVideoInsights(params: {
  accessToken: string;
  videoId: string;
}): Promise<PostInsights | null> {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(params.videoId)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${params.accessToken}` } });
  const body = (await res.json().catch(() => ({}))) as {
    items?: { statistics?: unknown }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(body.error?.message || `YouTube HTTP ${res.status}`);
  return mapYouTubeStatistics(body.items?.[0]?.statistics);
}

// ── Threads ──────────────────────────────────────────────────────────────

const THREADS_METRICS = ["views", "likes", "replies", "reposts", "quotes"] as const;

export async function fetchThreadsPostInsights(params: {
  accessToken: string;
  mediaId: string;
  graphBase?: string;
}): Promise<PostInsights | null> {
  const base = (params.graphBase ?? "https://graph.threads.net/v1.0").replace(/\/+$/, "");
  const url = `${base}/${encodeURIComponent(params.mediaId)}/insights?metric=${THREADS_METRICS.join(",")}&access_token=${encodeURIComponent(params.accessToken)}`;
  const res = await fetch(url);
  const body = (await res.json().catch(() => ({}))) as { data?: unknown; error?: { message?: string } };
  if (!res.ok) throw new Error(body.error?.message || `Threads HTTP ${res.status}`);
  return mapThreadsInsights(body.data);
}

// ── TikTok ───────────────────────────────────────────────────────────────

/** The public video id behind a publish_id, once TikTok has finished processing it. */
export async function resolveTikTokVideoId(params: { accessToken: string; publishId: string }): Promise<string | null> {
  const res = await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
    method: "POST",
    headers: { Authorization: `Bearer ${params.accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ publish_id: params.publishId }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    data?: { status?: string; publicaly_available_post_id?: (string | number)[] };
    error?: { code?: string; message?: string };
  };
  if (!res.ok || (body.error?.code && body.error.code !== "ok")) {
    throw new Error(body.error?.message || `TikTok HTTP ${res.status}`);
  }
  const id = body.data?.publicaly_available_post_id?.[0];
  return id != null && body.data?.status === "PUBLISH_COMPLETE" ? String(id) : null;
}

export async function fetchTikTokVideoInsights(params: {
  accessToken: string;
  /** The publish_id the post flow stored (or a bare video id). */
  publishId: string;
}): Promise<PostInsights | null> {
  const videoId = /^\d+$/.test(params.publishId)
    ? params.publishId
    : await resolveTikTokVideoId({ accessToken: params.accessToken, publishId: params.publishId });
  if (!videoId) return null;
  const res = await fetch("https://open.tiktokapis.com/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count", {
    method: "POST",
    headers: { Authorization: `Bearer ${params.accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ filters: { video_ids: [videoId] } }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    data?: { videos?: unknown[] };
    error?: { code?: string; message?: string };
  };
  if (!res.ok || (body.error?.code && body.error.code !== "ok")) {
    throw new Error(body.error?.message || `TikTok HTTP ${res.status}`);
  }
  return mapTikTokVideo(body.data?.videos?.[0]);
}
