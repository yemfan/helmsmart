import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { engagementScore, type Metric } from "@/lib/metrics";

/**
 * Performance summary — the "what's working" view. Aggregates the engagement
 * metrics Autopilot already collects onto each published post
 * (campaign_posts.metrics, refreshed by the cron) into totals + breakdowns by
 * platform / format / content angle, and the top posts. Powers the closed loop:
 * see the winners → make more like them.
 */

export type PlatformPerf = { platform: string; likes: number; comments: number; views: number; score: number };
export type GroupPerf = { key: string; count: number; score: number };
export type TopPost = {
  id: string;
  title: string | null;
  type: string;
  angle: string | null;
  mediaUrl: string | null;
  score: number;
  publishedAt: string | null;
};

export type PerfSummary = {
  totalPosts: number;
  totalEngagement: number;
  totalLikes: number;
  totalComments: number;
  totalViews: number;
  byPlatform: PlatformPerf[];
  byType: GroupPerf[];
  topAngles: GroupPerf[];
  topPosts: TopPost[];
};

type Row = {
  id: string;
  type: string | null;
  angle: string | null;
  title: string | null;
  media_url: string | null;
  metrics: Record<string, Metric> | null;
  published_at: string | null;
};

export async function buildPerformanceSummary(userId: string): Promise<PerfSummary> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("campaign_posts")
    .select("id, type, angle, title, media_url, metrics, published_at")
    .eq("user_id", userId)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(300);

  const rows = ((data ?? []) as Row[]).filter((r) => r.metrics && Object.keys(r.metrics).length > 0);

  const platform = new Map<string, PlatformPerf>();
  const byType = new Map<string, GroupPerf>();
  const byAngle = new Map<string, GroupPerf>();
  let totalLikes = 0;
  let totalComments = 0;
  let totalViews = 0;
  let totalEngagement = 0;

  const topPosts: TopPost[] = [];

  for (const r of rows) {
    const score = engagementScore(r.metrics);
    totalEngagement += score;

    // Per-platform tallies.
    for (const [plat, m] of Object.entries(r.metrics ?? {})) {
      const likes = m.likes ?? 0;
      const comments = m.comments ?? 0;
      const views = m.views ?? 0;
      totalLikes += likes;
      totalComments += comments;
      totalViews += views;
      const p = platform.get(plat) ?? { platform: plat, likes: 0, comments: 0, views: 0, score: 0 };
      p.likes += likes;
      p.comments += comments;
      p.views += views;
      p.score += likes + comments + views;
      platform.set(plat, p);
    }

    // By format (image/video/text).
    const t = r.type ?? "post";
    const tg = byType.get(t) ?? { key: t, count: 0, score: 0 };
    tg.count += 1;
    tg.score += score;
    byType.set(t, tg);

    // By content angle/pillar.
    const angle = r.angle?.trim();
    if (angle) {
      const ag = byAngle.get(angle) ?? { key: angle, count: 0, score: 0 };
      ag.count += 1;
      ag.score += score;
      byAngle.set(angle, ag);
    }

    topPosts.push({
      id: r.id,
      title: r.title,
      type: t,
      angle: r.angle,
      mediaUrl: r.media_url,
      score,
      publishedAt: r.published_at,
    });
  }

  const byScore = (a: { score: number }, b: { score: number }) => b.score - a.score;

  return {
    totalPosts: rows.length,
    totalEngagement,
    totalLikes,
    totalComments,
    totalViews,
    byPlatform: [...platform.values()].sort(byScore),
    byType: [...byType.values()].sort(byScore),
    topAngles: [...byAngle.values()].sort(byScore).slice(0, 6),
    topPosts: topPosts.sort(byScore).slice(0, 6),
  };
}
