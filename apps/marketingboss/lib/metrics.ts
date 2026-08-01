import "server-only";
import { metaGraphBase, threadsGraphBase } from "@helm/dna-marketing";

/**
 * Engagement metrics for a published post, fetched from each platform:
 *   Facebook  — likes/comments (page token)
 *   Instagram — like_count/comments_count
 *   YouTube   — statistics (views/likes/comments)
 *   Threads   — insights: likes/replies/views (needs the threads_manage_insights
 *               scope → reconnect Threads to grant it)
 *   Pinterest — pin analytics: saves→likes, clicks→comments, impressions→views
 *               (business account + pins:read)
 *   LinkedIn  — socialActions likes/comments (best-effort; member-post reads are
 *               gated by LinkedIn, so this often returns nothing without elevated
 *               API access)
 * Every fetcher is resilient: any network/permission failure returns null.
 */

export type Metric = { likes?: number; comments?: number; views?: number };

export const METRIC_SUPPORTED = new Set(["facebook", "instagram", "youtube", "threads", "pinterest", "linkedin"]);

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

async function threads(mediaId: string, token: string): Promise<Metric | null> {
  const base = threadsGraphBase();
  const d = await getJson(
    `${base}/${mediaId}/insights?metric=likes,replies,views&access_token=${encodeURIComponent(token)}`,
  );
  const rows = (d?.data as { name?: string; values?: { value?: number }[] }[] | undefined) ?? null;
  if (!rows) return null;
  const val = (name: string) => rows.find((r) => r.name === name)?.values?.[0]?.value ?? 0;
  return { likes: val("likes"), comments: val("replies"), views: val("views") };
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function pinterest(pinId: string, token: string): Promise<Metric | null> {
  const end = new Date();
  const start = new Date(end.getTime() - 28 * 24 * 3600 * 1000);
  const d = await getJson(
    `https://api.pinterest.com/v5/pins/${encodeURIComponent(pinId)}/analytics?start_date=${ymd(start)}&end_date=${ymd(
      end,
    )}&metric_types=IMPRESSION,SAVE,PIN_CLICK`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const summary = (d?.all as { summary_metrics?: Record<string, number> } | undefined)?.summary_metrics;
  if (!summary) return null;
  // Map Pinterest's engagement shape onto our common metric.
  return { likes: summary.SAVE ?? 0, comments: summary.PIN_CLICK ?? 0, views: summary.IMPRESSION ?? 0 };
}

async function linkedin(urn: string, token: string): Promise<Metric | null> {
  const d = await getJson(`https://api.linkedin.com/v2/socialActions/${encodeURIComponent(urn)}`, {
    headers: { Authorization: `Bearer ${token}`, "X-Restli-Protocol-Version": "2.0.0" },
  });
  if (!d) return null;
  const likes = (d.likesSummary as { aggregatedTotalLikes?: number; totalLikes?: number }) ?? {};
  const comments = (d.commentsSummary as { aggregatedTotalComments?: number }) ?? {};
  return { likes: likes.aggregatedTotalLikes ?? likes.totalLikes ?? 0, comments: comments.aggregatedTotalComments ?? 0 };
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
    case "threads":
      return threads(externalId, token);
    case "pinterest":
      return pinterest(externalId, token);
    case "linkedin":
      return linkedin(externalId, token);
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
