import "server-only";
import { metaGraphBase } from "@helm/dna-marketing";

/**
 * Engagement metrics for a published post, fetched from each platform. Only the
 * platforms whose read APIs work with our current OAuth scopes are supported:
 * Facebook (likes/comments), Instagram (like_count/comments_count), and YouTube
 * (statistics). LinkedIn/Threads/Pinterest need extra scopes + app review, so
 * they return null here (shown as "—" in the UI) until those are added.
 */

export type Metric = { likes?: number; comments?: number; views?: number };

export const METRIC_SUPPORTED = new Set(["facebook", "instagram", "youtube"]);

async function getJson(url: string, init?: RequestInit): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(url, init);
    const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return r.ok ? d : null;
  } catch {
    return null;
  }
}

async function facebook(externalId: string, token: string): Promise<Metric | null> {
  const base = metaGraphBase();
  const d = await getJson(
    `${base}/${externalId}?fields=likes.summary(true),comments.summary(true)&access_token=${encodeURIComponent(token)}`,
  );
  if (!d) return null;
  const likes = (d.likes as { summary?: { total_count?: number } })?.summary?.total_count;
  const comments = (d.comments as { summary?: { total_count?: number } })?.summary?.total_count;
  return { likes: likes ?? 0, comments: comments ?? 0 };
}

async function instagram(externalId: string, token: string): Promise<Metric | null> {
  const base = metaGraphBase();
  const d = await getJson(`${base}/${externalId}?fields=like_count,comments_count&access_token=${encodeURIComponent(token)}`);
  if (!d) return null;
  return { likes: Number(d.like_count) || 0, comments: Number(d.comments_count) || 0 };
}

async function youtube(videoId: string, token: string): Promise<Metric | null> {
  const d = await getJson(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(videoId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const stats = (d?.items as { statistics?: Record<string, string> }[] | undefined)?.[0]?.statistics;
  if (!stats) return null;
  return { likes: Number(stats.likeCount) || 0, comments: Number(stats.commentCount) || 0, views: Number(stats.viewCount) || 0 };
}

/** Fetch engagement for one published post on one platform. `token` is that platform's access token. */
export async function fetchMetric(platform: string, externalId: string, token: string): Promise<Metric | null> {
  switch (platform) {
    case "facebook":
      return facebook(externalId, token);
    case "instagram":
      return instagram(externalId, token);
    case "youtube":
      return youtube(externalId, token);
    default:
      return null;
  }
}

/** Total engagement across a metrics map, for ranking. */
export function engagementScore(metrics: Record<string, Metric> | null | undefined): number {
  if (!metrics) return 0;
  let total = 0;
  for (const m of Object.values(metrics)) total += (m.likes ?? 0) + (m.comments ?? 0) + (m.views ?? 0);
  return total;
}
