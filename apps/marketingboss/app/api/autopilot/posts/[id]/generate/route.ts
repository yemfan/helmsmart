import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addSpentCredits, getCampaign, getPost, updatePost } from "@/lib/campaigns";
import { generatePostMedia, BudgetError, CreditError } from "@/lib/generation";

export const maxDuration = 300;
export const runtime = "nodejs";

/** Generate (or regenerate) the media for one draft post — a review preview. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const post = await getPost(user.id, id);
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (post.type === "text") return NextResponse.json({ error: "Text posts have no media." }, { status: 400 });

  const campaign = await getCampaign(user.id, post.campaign_id);
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  try {
    const { url, cost } = await generatePostMedia(supabase, user.id, campaign, post);
    await updatePost(user.id, id, { media_url: url });
    await addSpentCredits(user.id, campaign.id, cost, campaign.spent_credits);
    return NextResponse.json({ url });
  } catch (e) {
    if (e instanceof BudgetError) return NextResponse.json({ error: e.message }, { status: 402 });
    if (e instanceof CreditError) return NextResponse.json({ error: `${e.message} Top up to keep creating.` }, { status: 402 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Generation failed." }, { status: 500 });
  }
}
