/**
 * The agent's marketing numbers, in one shape.
 *
 * Three sources that were measured in three places, if at all:
 *
 *   social   per-post metrics the hourly cron pulls into `lead_posts.metrics`
 *            (Facebook, Instagram, Pinterest today);
 *   ads      campaign insights in `lead_ad_campaigns.metrics` (Meta);
 *   hub      first-party traffic to the agent's own pages, by source.
 *
 * Every number here is real or absent. A platform that publishes but whose
 * API gives us nothing is reported as `metrics: null` with the reason, never
 * as a row of zeros — zero reads as "nobody looked", which is a different
 * claim from "we cannot see".
 *
 * Pure: rows in, summaries out. The route does the reading.
 */

export type PostRow = {
  platform?: unknown;
  status?: unknown;
  metrics?: unknown;
  metrics_refreshed_at?: unknown;
  published_at?: unknown;
  external_post_url?: unknown;
  caption?: unknown;
};

export type AdRow = {
  id?: unknown;
  name?: unknown;
  status?: unknown;
  objective?: unknown;
  metrics?: unknown;
  metrics_refreshed_at?: unknown;
  leads_received_count?: unknown;
  daily_budget_cents?: unknown;
  launched_at?: unknown;
};

/** Platforms whose post metrics the platform can fetch at all. */
export const SOCIAL_METRICS_SUPPORTED: Record<string, boolean> = {
  facebook: true,
  instagram: true,
  pinterest: true,
  threads: false,
  linkedin: false,
  tiktok: false,
  youtube: false,
  x: false,
};

export type PlatformSummary = {
  platform: string;
  posts: number;
  /** Posts with at least one non-null metric. */
  measured: number;
  metrics: {
    impressions: number | null;
    reach: number | null;
    clicks: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    saves: number | null;
    /** likes + comments + shares + saves, when any of them is known. */
    engagement: number | null;
  } | null;
  /** Why `metrics` is null: the API gives nothing, or nothing measured yet. */
  reason: "unsupported" | "no_data" | null;
  lastRefreshedAt: string | null;
};

export type TopPost = {
  platform: string;
  caption: string;
  url: string | null;
  publishedAt: string | null;
  engagement: number;
  impressions: number | null;
};

export type SocialSummary = {
  platforms: PlatformSummary[];
  totals: { posts: number; impressions: number | null; reach: number | null; clicks: number | null; engagement: number | null };
  topPosts: TopPost[];
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Sum that stays null until at least one input is a number. */
function add(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

function engagementOf(m: Record<string, unknown>): number | null {
  const parts = [num(m.likes), num(m.comments), num(m.shares), num(m.saves)];
  if (parts.every((p) => p === null)) return null;
  return parts.reduce<number>((s, p) => s + (p ?? 0), 0);
}

export function summariseSocial(rows: readonly PostRow[], opts: { topLimit?: number } = {}): SocialSummary {
  const byPlatform = new Map<string, PlatformSummary>();
  const top: TopPost[] = [];

  for (const row of rows) {
    const platform = str(row.platform).toLowerCase();
    if (!platform) continue;
    if (str(row.status) !== "published") continue;
    const m = (row.metrics && typeof row.metrics === "object" ? row.metrics : {}) as Record<string, unknown>;
    const supported = SOCIAL_METRICS_SUPPORTED[platform] ?? false;

    const s =
      byPlatform.get(platform) ??
      ({
        platform,
        posts: 0,
        measured: 0,
        metrics: null,
        reason: supported ? "no_data" : "unsupported",
        lastRefreshedAt: null,
      } satisfies PlatformSummary);
    s.posts++;

    const known = {
      impressions: num(m.impressions),
      reach: num(m.reach),
      clicks: num(m.clicks),
      likes: num(m.likes),
      comments: num(m.comments),
      shares: num(m.shares),
      saves: num(m.saves),
    };
    const anyKnown = Object.values(known).some((v) => v !== null);
    if (anyKnown) {
      s.measured++;
      const cur = s.metrics ?? {
        impressions: null,
        reach: null,
        clicks: null,
        likes: null,
        comments: null,
        shares: null,
        saves: null,
        engagement: null,
      };
      s.metrics = {
        impressions: add(cur.impressions, known.impressions),
        reach: add(cur.reach, known.reach),
        clicks: add(cur.clicks, known.clicks),
        likes: add(cur.likes, known.likes),
        comments: add(cur.comments, known.comments),
        shares: add(cur.shares, known.shares),
        saves: add(cur.saves, known.saves),
        engagement: add(cur.engagement, engagementOf(m)),
      };
      s.reason = null;
      const eng = engagementOf(m);
      if (eng !== null) {
        top.push({
          platform,
          caption: str(row.caption).replace(/\s+/g, " ").trim().slice(0, 120),
          url: str(row.external_post_url) || null,
          publishedAt: str(row.published_at) || null,
          engagement: eng,
          impressions: known.impressions,
        });
      }
    }
    const refreshed = str(row.metrics_refreshed_at);
    if (refreshed && (!s.lastRefreshedAt || refreshed > s.lastRefreshedAt)) s.lastRefreshedAt = refreshed;
    byPlatform.set(platform, s);
  }

  const platforms = [...byPlatform.values()].sort((a, b) => b.posts - a.posts || a.platform.localeCompare(b.platform));
  const totals = platforms.reduce(
    (t, p) => ({
      posts: t.posts + p.posts,
      impressions: add(t.impressions, p.metrics?.impressions ?? null),
      reach: add(t.reach, p.metrics?.reach ?? null),
      clicks: add(t.clicks, p.metrics?.clicks ?? null),
      engagement: add(t.engagement, p.metrics?.engagement ?? null),
    }),
    { posts: 0, impressions: null as number | null, reach: null as number | null, clicks: null as number | null, engagement: null as number | null },
  );

  return {
    platforms,
    totals,
    topPosts: top.sort((a, b) => b.engagement - a.engagement).slice(0, opts.topLimit ?? 5),
  };
}

export type CampaignSummary = {
  id: string;
  name: string;
  status: string;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  linkClicks: number | null;
  /** Leads actually received through the webhook — canonical over Meta's lagging count. */
  leads: number;
  spendCents: number | null;
  cplCents: number | null;
  dailyBudgetCents: number | null;
  lastRefreshedAt: string | null;
};

export type AdsSummary = {
  campaigns: CampaignSummary[];
  totals: { spendCents: number | null; impressions: number | null; clicks: number | null; leads: number; cplCents: number | null };
  /** Campaigns whose numbers are older than this many hours, for the "refresh" hint. */
  staleCount: number;
};

export function summariseAds(rows: readonly AdRow[], opts: { now?: number; staleAfterHours?: number } = {}): AdsSummary {
  const now = opts.now ?? Date.now();
  const staleMs = (opts.staleAfterHours ?? 24) * 3_600_000;
  const campaigns: CampaignSummary[] = rows.map((r) => {
    const m = (r.metrics && typeof r.metrics === "object" ? r.metrics : {}) as Record<string, unknown>;
    const refreshed = str(r.metrics_refreshed_at) || null;
    const leads = Math.max(num(r.leads_received_count) ?? 0, num(m.leads) ?? 0);
    const spend = num(m.spendCents);
    return {
      id: str(r.id),
      name: str(r.name) || str(r.objective) || str(r.id),
      status: str(r.status),
      impressions: num(m.impressions),
      reach: num(m.reach),
      clicks: num(m.clicks),
      linkClicks: num(m.inlineLinkClicks),
      leads,
      spendCents: spend,
      cplCents: spend !== null && leads > 0 ? Math.round(spend / leads) : num(m.cplCents),
      dailyBudgetCents: num(r.daily_budget_cents),
      lastRefreshedAt: refreshed,
    };
  });
  const totals = campaigns.reduce(
    (t, c) => ({
      spendCents: add(t.spendCents, c.spendCents),
      impressions: add(t.impressions, c.impressions),
      clicks: add(t.clicks, c.clicks),
      leads: t.leads + c.leads,
      cplCents: null as number | null,
    }),
    { spendCents: null as number | null, impressions: null as number | null, clicks: null as number | null, leads: 0, cplCents: null as number | null },
  );
  totals.cplCents = totals.spendCents !== null && totals.leads > 0 ? Math.round(totals.spendCents / totals.leads) : null;
  const staleCount = campaigns.filter(
    (c) => c.status === "active" && (!c.lastRefreshedAt || now - Date.parse(c.lastRefreshedAt) > staleMs),
  ).length;
  return { campaigns, totals, staleCount };
}

// ── hub traffic by source ────────────────────────────────────────────────

export type SourceFunnelRow = { source: string; views: number; leads: number; rate: number | null };

/**
 * Views and leads per acquisition source, first-touch: a conversion is
 * credited to the source recorded on it, which the lead route copies from
 * the visit that led to it.
 */
export function sourceFunnel(
  rows: readonly { event_type?: unknown; source?: unknown }[],
  opts: { limit?: number } = {},
): SourceFunnelRow[] {
  const map = new Map<string, { views: number; leads: number }>();
  for (const r of rows) {
    const source = (str(r.source).trim() || "direct").toLowerCase();
    const cur = map.get(source) ?? { views: 0, leads: 0 };
    if (r.event_type === "page_view") cur.views++;
    else if (r.event_type === "conversion") cur.leads++;
    else continue;
    map.set(source, cur);
  }
  return [...map.entries()]
    .map(([source, v]) => ({ source, views: v.views, leads: v.leads, rate: v.views > 0 ? v.leads / v.views : null }))
    .sort((a, b) => b.leads - a.leads || b.views - a.views)
    .slice(0, opts.limit ?? 8);
}
