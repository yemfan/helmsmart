import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publishToChannels, type ChannelPost } from "@/lib/publish-dispatch";

// Video upload to YouTube can take a bit; give the function room.
export const maxDuration = 300;
export const runtime = "nodejs";

// Which platforms can carry each post type.
const ELIGIBLE: Record<string, string[]> = {
  text: ["facebook", "threads", "linkedin"],
  image: ["facebook", "instagram", "threads", "linkedin", "pinterest"],
  video: ["youtube"],
};

/**
 * Publish the composed post to every selected platform, each with its own
 * AI-tailored caption (via the shared publish dispatch).
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const type = body.type === "text" || body.type === "video" ? body.type : "image";
  const mediaUrl = typeof body.url === "string" ? body.url : "";
  const link = typeof body.link === "string" && /^https?:\/\//.test(body.link) ? body.link : undefined;
  const title = typeof body.title === "string" ? body.title.trim() : undefined;
  const rawPosts = Array.isArray(body.posts) ? body.posts : [];

  const eligible = ELIGIBLE[type];
  const posts: ChannelPost[] = rawPosts
    .map((p) => p as { platform?: unknown; caption?: unknown })
    .filter((p) => typeof p.platform === "string" && typeof p.caption === "string" && eligible.includes(p.platform))
    .map((p) => ({ platform: p.platform as string, caption: p.caption as string }));

  if (posts.length === 0) return NextResponse.json({ error: "Pick at least one platform to publish to." }, { status: 400 });

  // Media-bearing posts must reference OUR Supabase Storage (SSRF guard).
  if (type !== "text") {
    const storagePrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/`;
    if (!mediaUrl || storagePrefix === "/storage/" || !mediaUrl.startsWith(storagePrefix)) {
      return NextResponse.json({ error: "Generate the media first." }, { status: 400 });
    }
  }

  const results = await publishToChannels(user.id, { type, mediaUrl, link, title, posts });
  return NextResponse.json({ results });
}
