import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publishToChannels, type ChannelPost } from "@/lib/publish-dispatch";
import { planPosts, type PlannedPost } from "@/lib/planner";
import { generatePostMediaAdmin, BudgetError, CreditError } from "@/lib/generation";
import { adaptForPlatforms, type Draft } from "@/lib/ai";
import { addSpentCredits, buildInsights, insertPostRows } from "@/lib/campaigns";
import { creditCost } from "@/lib/generation";
import { getConnection, getValidAccessToken } from "@/lib/social";
import { fetchMetric, METRIC_SUPPORTED, type Metric } from "@/lib/metrics";
import { runDueWeeklySlots } from "@/lib/weeklySchedule";
import { discoverForUser } from "@/lib/discovery";
import { latestOpportunityAt } from "@/lib/opportunities";
import { appliedLearningsHint, latestLearningAt, synthesizeLearnings } from "@/lib/learnings";
import { refreshViralLibrary, templateHints } from "@/lib/viralIntelligence";
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

// Plan cadence posts one day AHEAD of their publish slot, so review-mode
// users get a full day to approve without delaying the post — approval marks
// it ready; the drain still waits for the slot.
const REVIEW_LEAD_MS = 24 * 3600 * 1000;

// Small batches per tick so we stay within the function time budget.
const DRAIN_LIMIT = 8;
// Approved posts may still need media generation (slow), so a smaller batch.
const APPROVED_LIMIT = 2;
const ADVANCE_LIMIT = 5;
// Discovery includes a live web-research scout, so one user per tick — with a
// */15 cron and a once-per-24h per-user gate, that's still 96 scans/day of headroom.
const DISCOVER_LIMIT = 1;

type ScheduledRow = {
  id: string;
  user_id: string;
  type: "text" | "image" | "video";
  title: string | null;
  link: string | null;
  media_url: string | null;
  per_platform: Record<string, string> | null;
};

type ApprovedRow = ScheduledRow & {
  campaign_id: string | null;
  caption: string | null;
  hashtags: string[] | null;
  media_prompt: string | null;
  channels: string[] | null;
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
  /** Cost-only autonomy dial (0018); undefined pre-migration. */
  auto_approve_max_credits?: number | null;
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

  // 1b) Finish approved posts. Approval is instant in the UI — the user said
  // yes and moved on; this worker generates any missing media, tailors the
  // per-channel captions, and publishes on the next tick.
  const { data: approvedDue } = await admin
    .from("campaign_posts")
    .select("id, user_id, campaign_id, type, title, caption, hashtags, link, media_prompt, media_url, per_platform, channels")
    .eq("status", "approved")
    // Posts planned ahead carry their publish slot — approving early must not
    // publish early. No slot = publish on the next tick.
    .or(`scheduled_for.is.null,scheduled_for.lte.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(APPROVED_LIMIT);

  for (const post of (approvedDue as ApprovedRow[]) ?? []) {
    // Claim the row so overlapping ticks can't double-publish.
    const { data: claimed } = await admin
      .from("campaign_posts")
      .update({ status: "publishing" })
      .eq("id", post.id)
      .eq("status", "approved")
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    // A media post with nothing to render can't proceed — back to the queue.
    if (post.type !== "text" && !post.media_url && !post.media_prompt) {
      await admin.from("campaign_posts").update({ status: "draft" }).eq("id", post.id);
      continue;
    }

    try {
      let mediaUrl = post.media_url ?? undefined;
      if (post.type !== "text" && !mediaUrl) {
        let budget: number | null = null;
        let campSpent = 0;
        if (post.campaign_id) {
          const { data: camp } = await admin
            .from("campaigns")
            .select("budget_credits, spent_credits")
            .eq("id", post.campaign_id)
            .maybeSingle();
          budget = camp?.budget_credits ?? null;
          campSpent = camp?.spent_credits ?? 0;
        }
        const g = await generatePostMediaAdmin(admin, post.user_id, budget, campSpent, post.type, post.media_prompt ?? "");
        mediaUrl = g.url;
        await admin.from("campaign_posts").update({ media_url: mediaUrl }).eq("id", post.id);
        if (post.campaign_id) await addSpentCredits(post.user_id, post.campaign_id, g.cost, campSpent);
      }

      let posts: ChannelPost[];
      if (post.per_platform && Object.keys(post.per_platform).length > 0) {
        posts = Object.entries(post.per_platform).map(([platform, caption]) => ({ platform, caption }));
      } else {
        const draft: Draft = {
          title: post.title ?? "",
          caption: post.caption ?? "",
          cta: "",
          hashtags: post.hashtags ?? [],
          imagePrompt: "",
          videoPrompt: "",
        };
        posts = await adaptForPlatforms(draft, post.link, post.channels ?? []);
      }
      if (posts.length === 0) {
        await admin.from("campaign_posts").update({ status: "skipped" }).eq("id", post.id);
        continue;
      }

      const results = await publishToChannels(post.user_id, {
        type: post.type,
        mediaUrl,
        link: post.link ?? undefined,
        title: post.title ?? undefined,
        posts,
      });
      const anyOk = results.some((r) => r.ok);
      const perPlatform: Record<string, string> = {};
      for (const x of posts) perPlatform[x.platform] = x.caption;
      await admin
        .from("campaign_posts")
        .update({ status: anyOk ? "published" : "failed", per_platform: perPlatform, results, published_at: anyOk ? nowIso : null })
        .eq("id", post.id);
      drained++;
    } catch (e) {
      // Out of budget/credits isn't a failure of the post — hand it back to the
      // review queue instead of retrying (and re-billing) forever.
      const backToDraft = e instanceof BudgetError || e instanceof CreditError;
      await admin.from("campaign_posts").update({ status: backToDraft ? "draft" : "failed" }).eq("id", post.id);
    }
  }

  // 2) Advance active campaigns on their cadence.
  const { data: campaigns } = await admin
    .from("campaigns")
    .select("*") // tolerate a pre-0018 DB (no auto_approve_max_credits column)
    .eq("status", "active")
    .or(`next_run_at.is.null,next_run_at.lte.${nowIso}`)
    .limit(ADVANCE_LIMIT);

  for (const c of (campaigns as CampaignRow[]) ?? []) {
    const intervalMs = Math.round((7 * 24 * 3600 * 1000) / Math.min(Math.max(c.frequency, 1), 21));
    const nextRun = new Date(now.getTime() + intervalMs).toISOString();
    let spent = c.spent_credits;

    if (c.brief) {
      try {
        const [autoInsights, learned, styleHints] = await Promise.all([
          buildInsights(c.user_id, c.id).catch(() => null),
          appliedLearningsHint(c.user_id, c.id).catch(() => null),
          templateHints(),
        ]);
        const insights = [autoInsights, learned].filter(Boolean).join("\n") || null;
        const planned = (
          await planPosts(c.brief, { mediaTypes: c.media_types, channels: c.channels, link: c.link, count: 1, insights, styleHints })
        )[0];
        if (planned) {
          const channels = (c.channels || []).filter((ch) => (ELIGIBLE[planned.type] || []).includes(ch));
          // Autonomy is gated on COST, not confidence: full-auto runs everything,
          // and review mode auto-runs actions at or under the playbook's
          // auto-approve dial (early marketing is exploration — the prepaid
          // credit budget is the constraint, not certainty). Pricier actions
          // (and no-channel plans) still queue for approval.
          const cost = planned.type === "text" ? 0 : creditCost(planned.type, false);
          const dial = c.auto_approve_max_credits;
          const autonomous = c.mode === "auto" || (typeof dial === "number" && cost <= dial);
          // Plan a day ahead: the post gets a publish slot 24h out. Review
          // drafts sit in the queue a full day before they're due; autonomous
          // posts are pre-rendered and visible (cancellable) as Scheduled.
          const publishAt = new Date(now.getTime() + REVIEW_LEAD_MS).toISOString();
          if (autonomous && channels.length > 0) {
            spent = await autoSchedule(admin, c, planned, channels, spent, publishAt);
            posted++;
          } else {
            await insertDraft(admin, c, planned, channels, publishAt);
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

  // Weekly schedule: research + enqueue posts for any due weekday slots. The
  // scheduled rows drain on the next tick. Best-effort — never fails the cron.
  let weeklyEnqueued = 0;
  try {
    const w = await runDueWeeklySlots();
    weeklyEnqueued = w.enqueued;
  } catch (e) {
    console.warn("[cron/run] weekly-schedule phase failed:", e instanceof Error ? e.message : e);
  }

  // 5a) Shared viral-library refresh (Marketing Intelligence Engine) — one
  // scout+analyze sweep per ~22h. It shares the tick's time budget with the
  // per-user discovery below, so whichever fires first wins the tick.
  let viralRefresh: { found: number; templated: number } | null = null;
  try {
    viralRefresh = await refreshViralLibrary();
  } catch (e) {
    console.warn("[cron/run] viral-library phase failed:", e instanceof Error ? e.message : e);
  }

  // 5) Opportunity discovery — scan trends / competitors / performance for users
  // who haven't been scanned in 24h. Best-effort; no-ops pre-migration-0015.
  // Skipped on ticks where the viral refresh ran (function time budget).
  let discovered = 0;
  if (viralRefresh === null) try {
    const [{ data: owners }, { data: kits }] = await Promise.all([
      admin.from("campaigns").select("user_id").eq("status", "active").limit(50),
      admin.from("brand_kits").select("user_id").limit(50),
    ]);
    const users = [
      ...new Set(
        [...((owners as { user_id: string }[]) ?? []), ...((kits as { user_id: string }[]) ?? [])].map((r) => r.user_id),
      ),
    ];
    const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
    let ran = 0;
    for (const uid of users) {
      if (ran >= DISCOVER_LIMIT) break;
      const latest = await latestOpportunityAt(uid);
      if (latest && latest > dayAgo) continue;
      ran++;
      try {
        const r = await discoverForUser(uid);
        discovered += r.found;
      } catch {
        /* per-user best effort */
      }
    }
  } catch (e) {
    console.warn("[cron/run] discovery phase failed:", e instanceof Error ? e.message : e);
  }

  // 6) Learning synthesis — pure-code cohort comparisons over each user's own
  // published results, at most weekly per user. Best-effort; no-ops pre-0017.
  let learned = 0;
  try {
    const { data: publishers } = await admin
      .from("campaign_posts")
      .select("user_id")
      .eq("status", "published")
      .not("metrics", "is", null)
      .order("published_at", { ascending: false })
      .limit(50);
    const users = [...new Set(((publishers as { user_id: string }[]) ?? []).map((r) => r.user_id))];
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
    let ran = 0;
    for (const uid of users) {
      if (ran >= 1) break;
      const latest = await latestLearningAt(uid);
      if (latest && latest > weekAgo) continue;
      ran++;
      try {
        learned += await synthesizeLearnings(uid);
      } catch {
        /* per-user best effort */
      }
    }
  } catch (e) {
    console.warn("[cron/run] learning phase failed:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true, drained, posted, drafted, refreshed, weeklyEnqueued, discovered, learned, viralRefresh, at: nowIso });
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

async function insertDraft(
  admin: SupabaseClient,
  c: CampaignRow,
  p: PlannedPost,
  channels: string[],
  publishAt?: string,
): Promise<void> {
  await insertPostRows(admin, [
    {
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
      scheduled_for: publishAt ?? null,
      reasoning: p.reasoning || null,
      estimated_credits: p.type === "text" ? 0 : creditCost(p.type, false),
    },
  ]);
}

/**
 * Generate (if needed), tailor, and SCHEDULE one autonomous post for its slot
 * (a day out) — visible and cancellable until the drain publishes it.
 * Returns new spent total.
 */
async function autoSchedule(
  admin: SupabaseClient,
  c: CampaignRow,
  p: PlannedPost,
  channels: string[],
  spent: number,
  publishAt: string,
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
      await insertDraft(admin, c, p, channels, publishAt);
      return spent;
    }
    throw e;
  }

  const draft: Draft = { title: p.title, caption: captionOf(p), cta: "", hashtags: p.hashtags, imagePrompt: "", videoPrompt: "" };
  const posts = await adaptForPlatforms(draft, c.link, channels);
  const perPlatform: Record<string, string> = {};
  for (const x of posts) perPlatform[x.platform] = x.caption;

  await insertPostRows(admin, [
    {
      user_id: c.user_id,
      campaign_id: c.id,
      status: "scheduled",
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
      scheduled_for: publishAt,
      reasoning: p.reasoning || null,
    },
  ]);

  return spent;
}
