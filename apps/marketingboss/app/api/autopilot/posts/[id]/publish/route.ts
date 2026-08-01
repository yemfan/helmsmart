import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addSpentCredits, getCampaign, getPost, updatePost } from "@/lib/campaigns";
import { generatePostMedia, BudgetError, CreditError } from "@/lib/generation";
import { adaptForPlatforms, type Draft } from "@/lib/ai";
import { publishToChannels, type ChannelPost } from "@/lib/publish-dispatch";

export const maxDuration = 300;
export const runtime = "nodejs";

/** Approve & publish a draft post to its channels (generating media if needed). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const post = await getPost(user.id, id);
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (post.status === "published") return NextResponse.json({ error: "Already published." }, { status: 400 });
  if (!post.channels || post.channels.length === 0) {
    return NextResponse.json({ error: "This post has no channels." }, { status: 400 });
  }

  const campaign = await getCampaign(user.id, post.campaign_id);
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  let mediaUrl = post.media_url ?? undefined;
  try {
    // Generate media on the fly if this is a media post that wasn't previewed.
    if (post.type !== "text" && !mediaUrl) {
      const gen = await generatePostMedia(supabase, user.id, campaign, post);
      mediaUrl = gen.url;
      await updatePost(user.id, id, { media_url: mediaUrl });
      await addSpentCredits(user.id, campaign.id, gen.cost, campaign.spent_credits);
    }

    // Per-channel captions: reuse a prior tailoring, else tailor now.
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
      posts = await adaptForPlatforms(draft, post.link, post.channels);
    }

    const results = await publishToChannels(user.id, {
      type: post.type,
      mediaUrl,
      link: post.link ?? undefined,
      title: post.title ?? undefined,
      posts,
    });

    const anyOk = results.some((r) => r.ok);
    const perPlatform: Record<string, string> = {};
    for (const p of posts) perPlatform[p.platform] = p.caption;

    await updatePost(user.id, id, {
      status: anyOk ? "published" : "failed",
      per_platform: perPlatform,
      results,
      published_at: anyOk ? new Date().toISOString() : null,
    });

    return NextResponse.json({ results, status: anyOk ? "published" : "failed", mediaUrl });
  } catch (e) {
    if (e instanceof BudgetError) return NextResponse.json({ error: e.message }, { status: 402 });
    if (e instanceof CreditError) return NextResponse.json({ error: `${e.message} Top up to keep creating.` }, { status: 402 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Publish failed." }, { status: 500 });
  }
}
