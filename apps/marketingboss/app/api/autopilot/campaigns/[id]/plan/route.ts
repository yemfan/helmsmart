import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildInsights, getCampaign, insertPosts, type PlannedPostRow } from "@/lib/campaigns";
import { appliedLearningsHint } from "@/lib/learnings";
import { creditCost } from "@/lib/generation";
import { planPosts } from "@/lib/planner";
import { templateHints } from "@/lib/viralIntelligence";

export const maxDuration = 120;
export const runtime = "nodejs";

const ELIGIBLE: Record<string, string[]> = {
  text: ["facebook", "threads", "linkedin"],
  image: ["facebook", "instagram", "threads", "linkedin", "pinterest"],
  video: ["youtube", "tiktok"],
};

/** Plan a batch of draft posts for a campaign, into its review queue. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const campaign = await getCampaign(user.id, id);
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (!campaign.brief) return NextResponse.json({ error: "This campaign has no brief yet." }, { status: 400 });

  let count = 3;
  try {
    const body = (await req.json()) as { count?: unknown };
    if (typeof body.count === "number") count = body.count;
  } catch {
    /* default */
  }

  try {
    const [autoInsights, learned, styleHints] = await Promise.all([
      buildInsights(user.id, id).catch(() => null),
      appliedLearningsHint(user.id, id).catch(() => null),
      templateHints(),
    ]);
    const insights = [autoInsights, learned].filter(Boolean).join("\n") || null;
    const planned = await planPosts(campaign.brief, {
      mediaTypes: campaign.media_types,
      channels: campaign.channels,
      link: campaign.link,
      count,
      insights,
      styleHints,
    });
    if (planned.length === 0) return NextResponse.json({ error: "The planner returned nothing — try again." }, { status: 502 });

    const rows: PlannedPostRow[] = planned.map((p) => ({
      type: p.type,
      angle: p.angle,
      title: p.title,
      // Fold the CTA into the caption so the review queue shows the full post.
      caption: p.cta ? `${p.caption}\n\n${p.cta}` : p.caption,
      hashtags: p.hashtags,
      link: campaign.link,
      media_prompt: p.mediaPrompt,
      channels: (campaign.channels || []).filter((c) => (ELIGIBLE[p.type] || []).includes(c)),
      reasoning: p.reasoning || null,
      estimated_credits: p.type === "text" ? 0 : creditCost(p.type, false),
    }));

    const posts = await insertPosts(user.id, id, rows);
    return NextResponse.json({ posts });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Planning failed." }, { status: 500 });
  }
}
