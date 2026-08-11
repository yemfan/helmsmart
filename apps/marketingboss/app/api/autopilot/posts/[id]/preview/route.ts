import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPost, updatePost } from "@/lib/campaigns";
import { adaptForPlatforms, type Draft } from "@/lib/ai";

export const maxDuration = 60;
export const runtime = "nodejs";

/**
 * Tailor the per-platform captions NOW (no publish, no credits) so the review
 * card can show exactly what each channel will receive. Reuses a prior
 * tailoring when the copy hasn't changed (edits clear per_platform via PATCH).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const post = await getPost(user.id, id);
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (!post.channels || post.channels.length === 0) {
    return NextResponse.json({ error: "This post has no channels." }, { status: 400 });
  }

  try {
    let perPlatform = post.per_platform;
    if (!perPlatform || Object.keys(perPlatform).length === 0) {
      const draft: Draft = {
        title: post.title ?? "",
        caption: post.caption ?? "",
        cta: "",
        hashtags: post.hashtags ?? [],
        imagePrompt: "",
        videoPrompt: "",
      };
      const posts = await adaptForPlatforms(draft, post.link, post.channels);
      perPlatform = {};
      for (const p of posts) perPlatform[p.platform] = p.caption;
      await updatePost(user.id, id, { per_platform: perPlatform });
    }
    return NextResponse.json({ perPlatform, mediaUrl: post.media_url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Preview failed." }, { status: 500 });
  }
}
