import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publishToChannels, type ChannelPost } from "@/lib/publish-dispatch";
import { planPosts, type PlannedPost } from "@/lib/planner";
import { generatePostMediaAdmin, BudgetError, CreditError } from "@/lib/generation";
import { adaptForPlatforms, type Draft } from "@/lib/ai";
import { buildInsights } from "@/lib/campaigns";
import { getConnection, getValidAccessToken } from "@/lib/social";
import { fetchMetric, METRIC_SUPPORTED, type Metric } from "@/lib/metrics";
import type { BrandBrief } from "@/lib/research";
import type { SupabaseClient } from "@supabase/supabase-js";

// Vercel Cron hits this on a schedule (see vercel.json). Protected by CRON_SECRET.
export const maxDuration = 300;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ELIGIBLE: Record<string, string[]> = {
  text: ["facebook", "threads", "linkedin"],
  image: ["facebook", "instagram", "threads", "linkedin", "pinterest"],
  video: ["youtube", "tiktok"],
};

// Small batches per tick so we stay within the function time budget.
const DRAIN_LIMIT = 8;
const ADVANCE_LIMIT = 5;

type ScheduledRow = {
  id: string;
  user_id: string;
  type: "text" | "image" | "video";
  title: string | null;
  link: string | null;
  media_url: string | null;
  per_platform: Record<string, string> | null;
};

type CampaignRow = {
  id: string;
  user_id: string;
  mode: "review" | "auto";
  brief: BrandBrief | null;
  media_types: string[];
  channels: string[];
  link: string;
  frequency: number;
  budget_credits: number | null;
  spent_credits: number;
};

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron is not configured." }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  let drained = 0;
  let posted = 0;
  let drafted = 0;

  // 1) Publish any scheduled posts whose time has come (media is pre-rendered).
  const { data: due } = await admin
    .from("campaign_posts")
    .select("id, user_id, type, title, link, media_url, per_platform")
    .eq("status", "scheduled")
    .lte("scheduled_for", nowIso)
    .limit(DRAIN_LIMIT);

  for (const post of (due as ScheduledRow[]) ?? []) {
    const posts: ChannelPost[] = Object.entries(post.per_platform ?? {}).map(([platform, caption]) => ({ platform, caption }));
    if (posts.length === 0) {
      await admin.from("campaign_posts").update({ status: "skipped" }).eq("id", post.id);
      continue;
    }
    try {
      const results = await publishToChannels(post.user_id, {
        type: post.type,
        mediaUrl: post.media_url ?? undefined,
        link: post.link ?? undefined,
        title: post.title ?? undefined,
        posts,
      });
      const anyOk = results.some((r) => r.ok);
      await admin
        .from("campaign_posts")
        .update({ status: anyOk ? "published" : "failed", results, published_at: anyOk ? nowIso : null })
        .eq("id", post.id);
      drained++;
    } catch {
      await admin.from("campaign_posts").update({ status: "failed" }).eq("id", post.id);
    }
  }

  // 2) Advance active campaigns on their cadence.
  const { data: campaigns } = await admin
    .from("campaigns")
    .select("id, user_id, mode, brief, media_types, channels, link, frequency, budget_credits, spent_credits")
    .eq("status", "active")
    .or(`next_run_at.is.null,next_run_at.lte.${nowIso}`)
    .limit(ADVANCE_LIMIT);

  for (const c of (campaigns as CampaignRow[]) ?? []) {
    const intervalMs = Math.round((7 * 24 * 3600 * 1000) / Math.min(Math.max(c.frequency, 1), 21));
    const nextRun = new Date(now.getTime() + intervalMs).toISOString();
    let spent = c.spent_credits;

    if (c.brief) {
      try {
        const insights = await buildInsights(c.user_id, c.id).catch(() => null);
        const planned = (
          await planPosts(c.brief, { mediaTypes: c.media_types, channels: c.channels, link: c.link, count: 1, insights })
        )[0];
        if (planned) {
          const channels = (c.channels || []).filter((ch) => (ELIGIBLE[planned.type] || []).includes(ch));
          // Full-auto: generate + tailor + publish now. Review (or no channels): drop a draft.
          if (c.mode === "auto" && channels.length > 0) {
            spent = await autoPublish(admin, c, planned, channels, spent, nowIso);
            posted++;
          } else {
            await insertDraft(admin, c, planned, channels);
            drafted++;
          }
        }
      } catch {
        /* leave next_run_at bumped; retry next cycle */
      }
    }

    await admin.from("campaigns").update({ next_run_at: nextRun, spent_credits: spent, updated_at: nowIso }).eq("id", c.id);
  }

  // 3) Refresh engagement metrics for recently published posts (FB / IG / YouTube).
  const since = new Date(now.getTime() - 14 * 24 * 3600 * 1000).toISOString();
  const stale = new Date(now.getTime() - 6 * 3600 * 1000).toISOString();
  const { data: recent } = await admin
    .from("campaign_posts")
    .select("id, user_id, results, metrics")
    .eq("status", "published")
    .gte("published_at", since)
    .or(`metrics_at.is.null,metrics_at.lte.${stale}`)
    .limit(10);

  let refreshed = 0;
  for (const post of (recent as MetricRow[]) ?? []) {
    const metrics: Record<string, Metric> = post.metrics ?? {};
    for (const r of post.results ?? []) {
      if (!r.ok || !r.externalId || !METRIC_SUPPORTED.has(r.platform)) continue;
      const conn = await getConnection(post.user_id, r.platform).catch(() => null);
      if (!conn) continue;
      const token = r.platform === "youtube" ? await getValidAccessToken(post.user_id, conn).catch(() => null) : conn.access_token;
      if (!token) continue;
      const m = await fetchMetric(r.platform, r.externalId, token);
      if (m) metrics[r.platform] = m;
    }
    await admin.from("campaign_posts").update({ metrics, metrics_at: nowIso }).eq("id", post.id);
    refreshed++;
  }

  return NextResponse.json({ ok: true, drained, posted, drafted, refreshed, at: nowIso });
}

type MetricRow = {
  id: string;
  user_id: string;
  results: { platform: string; ok: boolean; externalId?: string }[] | null;
  metrics: Record<string, Metric> | null;
};

function captionOf(p: PlannedPost): string {
  return p.cta ? `${p.caption}\n\n${p.cta}` : p.caption;
}

async function insertDraft(admin: SupabaseClient, c: CampaignRow, p: PlannedPost, channels: string[]): Promise<void> {
  await admin.from("campaign_posts").insert({
    user_id: c.user_id,
    campaign_id: c.id,
    status: "draft",
    type: p.type,
    angle: p.angle,
    title: p.title,
    caption: captionOf(p),
    hashtags: p.hashtags,
    link: c.link,
    media_prompt: p.mediaPrompt,
    channels,
  });
}

/** Generate (if needed), tailor, publish, and record one auto post. Returns new spent total. */
async function autoPublish(
  admin: SupabaseClient,
  c: CampaignRow,
  p: PlannedPost,
  channels: string[],
  spent: number,
  nowIso: string,
): Promise<number> {
  let mediaUrl: string | undefined;
  try {
    if (p.type !== "text") {
      const g = await generatePostMediaAdmin(admin, c.user_id, c.budget_credits, spent, p.type, p.mediaPrompt);
      mediaUrl = g.url;
      spent += g.cost;
    }
  } catch (e) {
    // Out of budget/credits — fall back to a draft so the cadence still produces something.
    if (e instanceof BudgetError || e instanceof CreditError) {
      await insertDraft(admin, c, p, channels);
      return spent;
    }
    throw e;
  }

  const draft: Draft = { title: p.title, caption: captionOf(p), cta: "", hashtags: p.hashtags, imagePrompt: "", videoPrompt: "" };
  const posts = await adaptForPlatforms(draft, c.link, channels);
  const results = await publishToChannels(c.user_id, {
    type: p.type,
    mediaUrl,
    link: c.link,
    title: p.title,
    posts,
  });
  const anyOk = results.some((r) => r.ok);
  const perPlatform: Record<string, string> = {};
  for (const x of posts) perPlatform[x.platform] = x.caption;

  await admin.from("campaign_posts").insert({
    user_id: c.user_id,
    campaign_id: c.id,
    status: anyOk ? "published" : "failed",
    type: p.type,
    angle: p.angle,
    title: p.title,
    caption: captionOf(p),
    hashtags: p.hashtags,
    link: c.link,
    media_prompt: p.mediaPrompt,
    media_url: mediaUrl ?? null,
    per_platform: perPlatform,
    channels,
    results,
    published_at: anyOk ? nowIso : null,
  });

  return spent;
}
