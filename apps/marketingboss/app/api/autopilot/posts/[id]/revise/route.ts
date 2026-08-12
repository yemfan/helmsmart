import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPost, updatePost } from "@/lib/campaigns";
import { anthropicJson, CRAFT_RULES, HOOK_RULE, MEDIA_CRAFT } from "@/lib/ai";
import { BRAND_KIT_COLUMNS, brandPromptContext, type BrandKit } from "@/lib/brandKit";

export const maxDuration = 60;
export const runtime = "nodejs";

const REVISE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    caption: { type: "string" },
    hashtags: { type: "array", items: { type: "string" } },
    mediaPrompt: { type: "string" },
  },
  required: ["title", "caption", "hashtags", "mediaPrompt"],
  additionalProperties: false,
};

/**
 * Revise a draft to the owner's instructions, then hand it back for review —
 * the middle path between Approve and Skip. Clears stale tailoring, and clears
 * the rendered media only when the visual concept actually changed.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  let feedback = "";
  try {
    const body = (await req.json()) as { feedback?: string };
    feedback = (body.feedback ?? "").trim().slice(0, 1000);
  } catch {
    /* fall through to the empty-feedback error */
  }
  if (!feedback) return NextResponse.json({ error: "Tell the team what to change first." }, { status: 400 });

  const post = await getPost(user.id, id);
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (post.status !== "draft") {
    return NextResponse.json({ error: "Only drafts can be revised — pull it back to drafts first." }, { status: 400 });
  }

  try {
    const { data: kit } = await supabase.from("brand_kits").select(BRAND_KIT_COLUMNS).eq("user_id", user.id).maybeSingle();
    const brand = brandPromptContext(kit as BrandKit | null);
    const wantsMedia = post.type !== "text";

    const system = [
      "You revise ONE social post to incorporate the business owner's feedback. Their feedback is the top priority — apply it fully, keep what already works, and stay on brand.",
      brand,
      CRAFT_RULES,
      "Return ALL fields:",
      "- title: the revised headline, short and punchy.",
      "- caption: the revised post copy, no hashtags inside it. " + HOOK_RULE,
      "- hashtags: 4–8 relevant tags WITHOUT the # sign.",
      wantsMedia
        ? `- mediaPrompt: the revised ${post.type}-generation prompt (subject, setting, style, lighting, composition, mood). ${MEDIA_CRAFT} Design it to work WITHOUT any rendered text — image models garble lettering; only when a short overlay is truly essential, give the exact wording (3 words max) in double quotes. If the feedback doesn't affect the visual, return the current media prompt UNCHANGED.`
        : "- mediaPrompt: an empty string (this is a text-only post).",
    ]
      .filter(Boolean)
      .join("\n");

    const userMsg = [
      "Current post:",
      JSON.stringify({
        type: post.type,
        angle: post.angle,
        title: post.title,
        caption: post.caption,
        hashtags: post.hashtags,
        mediaPrompt: post.media_prompt,
      }),
      "",
      `The owner's feedback (apply this): ${feedback}`,
    ].join("\n");

    const out = await anthropicJson<{ title: string; caption: string; hashtags: string[]; mediaPrompt: string }>({
      system,
      user: userMsg,
      schema: REVISE_SCHEMA,
      maxTokens: 1500,
    });

    const hashtags = (out.hashtags ?? []).filter((h) => typeof h === "string").map((h) => h.replace(/^#/, "").trim()).filter(Boolean);
    const newMediaPrompt = wantsMedia ? out.mediaPrompt.trim() : "";
    const mediaCleared = wantsMedia && !!post.media_url && newMediaPrompt !== (post.media_prompt ?? "").trim();

    await updatePost(user.id, id, {
      title: out.title,
      caption: out.caption,
      hashtags,
      media_prompt: wantsMedia ? newMediaPrompt || post.media_prompt : post.media_prompt,
      per_platform: null,
      ...(mediaCleared ? { media_url: null } : {}),
    });

    return NextResponse.json({ title: out.title, caption: out.caption, hashtags, mediaPrompt: newMediaPrompt, mediaCleared });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Revision failed." }, { status: 500 });
  }
}
