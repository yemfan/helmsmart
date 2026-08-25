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

/**
 * One platform's numbers for one post.
 *
 * `saves` and `clicks` exist because folding them into likes/comments threw
 * away the two most valuable signals we collect: a save is a stronger vote than
 * a like, and a click is the closest thing to intent any of these APIs expose.
 * Pinterest used to report SAVE as `likes` and PIN_CLICK as `comments`, which
 * made outbound-click data invisible to every consumer.
 */
export type Metric = {
  likes?: number;
  comments?: number;
  views?: number;
  /** Saves / bookmarks — a stronger signal than a like where the platform has it. */
  saves?: number;
  /** Outbound or post clicks, where the platform reports them (Pinterest today). */
  clicks?: number;
};

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
  // Pinterest's shape maps cleanly now that Metric has saves/clicks. Rows written
  // before this change still carry SAVE in `likes` and PIN_CLICK in `comments`;
  // the cron re-reads metrics for 14 days after publish, so recent posts
  // self-correct and only long-dormant rows keep the old shape.
  return { saves: summary.SAVE ?? 0, clicks: summary.PIN_CLICK ?? 0, views: summary.IMPRESSION ?? 0 };
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

/**
 * What a post is being judged on. A campaign chasing reach and one chasing
 * clicks are not the same campaign, and scoring them with one number is how a
 * learning loop ends up "optimizing" a metric nobody asked for.
 */
export type MetricGoal = "awareness" | "engagement" | "traffic";

/**
 * Per-signal weights by goal.
 *
 * The previous score summed likes + comments + views at weight 1, which meant
 * views swamped everything — a clip with 10k views and 3 likes outranked a post
 * with 500 likes, because views run one to two orders of magnitude higher on
 * every platform that reports them. That single number fed buildInsights,
 * the performance scout, AND the learning synthesizer, so all three concluded
 * "post more video" by arithmetic rather than by evidence.
 *
 * The weights below are a stated judgement, not a measurement: a view is
 * passive, a like is cheap, a comment or save costs the viewer something, and a
 * click is the closest thing to intent these APIs expose. They live here so
 * there is exactly one place to argue with them.
 */
const WEIGHTS: Record<MetricGoal, Required<Omit<Metric, never>>> = {
  awareness: { views: 1, likes: 0.5, comments: 1, saves: 1, clicks: 2 },
  engagement: { views: 0.05, likes: 1, comments: 4, saves: 3, clicks: 5 },
  traffic: { views: 0.01, likes: 0.25, comments: 1, saves: 1, clicks: 10 },
};

/** Score a metrics map against one goal. Deterministic; missing signals count 0. */
export function scoreFor(goal: MetricGoal, metrics: Record<string, Metric> | null | undefined): number {
  if (!metrics) return 0;
  const w = WEIGHTS[goal];
  let total = 0;
  for (const m of Object.values(metrics)) {
    total +=
      (m.views ?? 0) * w.views +
      (m.likes ?? 0) * w.likes +
      (m.comments ?? 0) * w.comments +
      (m.saves ?? 0) * w.saves +
      (m.clicks ?? 0) * w.clicks;
  }
  return Math.round(total * 10) / 10;
}

/**
 * Total engagement across a metrics map, for ranking. Kept as the default so
 * every existing caller (buildInsights, buildPerformanceSummary, Home's top
 * post) improves together rather than drifting apart.
 */
export function engagementScore(metrics: Record<string, Metric> | null | undefined): number {
  return scoreFor("engagement", metrics);
}

/** Raw totals across platforms — for display, where weighting would mislead. */
export function metricTotals(metrics: Record<string, Metric> | null | undefined): Required<Metric> {
  const out = { likes: 0, comments: 0, views: 0, saves: 0, clicks: 0 };
  for (const m of Object.values(metrics ?? {})) {
    out.likes += m.likes ?? 0;
    out.comments += m.comments ?? 0;
    out.views += m.views ?? 0;
    out.saves += m.saves ?? 0;
    out.clicks += m.clicks ?? 0;
  }
  return out;
}
