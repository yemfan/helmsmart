import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publishToChannels, type ChannelPost } from "@/lib/publish-dispatch";
import { planPosts } from "@/lib/planner";
import type { BrandBrief } from "@/lib/research";

// Vercel Cron hits this on a schedule (see vercel.json). Protected by CRON_SECRET.
export const maxDuration = 300;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ELIGIBLE: Record<string, string[]> = {
  text: ["facebook", "threads", "linkedin"],
  image: ["facebook", "instagram", "threads", "linkedin", "pinterest"],
  video: ["youtube"],
};

// Small batches per tick so we stay within the function time budget.
const DRAIN_LIMIT = 8;
const ADVANCE_LIMIT = 8;

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
  let advanced = 0;

  // 1) Publish any scheduled posts whose time has come (media is pre-rendered).
  const { data: due } = await admin
    .from("campaign_posts")
    .select("id, user_id, type, title, link, media_url, per_platform")
    .eq("status", "scheduled")
    .lte("scheduled_for", nowIso)
    .limit(DRAIN_LIMIT);

  for (const post of (due as ScheduledRow[]) ?? []) {
    const perPlatform = post.per_platform ?? {};
    const posts: ChannelPost[] = Object.entries(perPlatform).map(([platform, caption]) => ({ platform, caption }));
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

  // 2) Advance active campaigns on their cadence — plan a fresh draft into the queue.
  const { data: campaigns } = await admin
    .from("campaigns")
    .select("id, user_id, brief, media_types, channels, link, frequency, budget_credits, spent_credits")
    .eq("status", "active")
    .or(`next_run_at.is.null,next_run_at.lte.${nowIso}`)
    .limit(ADVANCE_LIMIT);

  for (const c of (campaigns as CampaignRow[]) ?? []) {
    const intervalMs = Math.round((7 * 24 * 3600 * 1000) / Math.min(Math.max(c.frequency, 1), 21));
    const nextRun = new Date(now.getTime() + intervalMs).toISOString();

    const overBudget = c.budget_credits != null && c.spent_credits >= c.budget_credits;
    if (c.brief && !overBudget) {
      try {
        const planned = await planPosts(c.brief, {
          mediaTypes: c.media_types,
          channels: c.channels,
          link: c.link,
          count: 1,
        });
        const rows = planned.map((p) => ({
          user_id: c.user_id,
          campaign_id: c.id,
          status: "draft",
          type: p.type,
          angle: p.angle,
          title: p.title,
          caption: p.cta ? `${p.caption}\n\n${p.cta}` : p.caption,
          hashtags: p.hashtags,
          link: c.link,
          media_prompt: p.mediaPrompt,
          channels: (c.channels || []).filter((ch) => (ELIGIBLE[p.type] || []).includes(ch)),
        }));
        if (rows.length) await admin.from("campaign_posts").insert(rows);
        advanced++;
      } catch {
        /* leave next_run_at bumped; try again next cycle */
      }
    }
    await admin.from("campaigns").update({ next_run_at: nextRun, updated_at: nowIso }).eq("id", c.id);
  }

  return NextResponse.json({ ok: true, drained, advanced, at: nowIso });
}
