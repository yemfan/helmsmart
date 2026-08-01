import { NextResponse } from "next/server";
import { publishToAll, type PostContent, type PublishResult, type SocialPlatform } from "@helm/dna-marketing";
import { createClient } from "@/lib/supabase/server";
import { createConnectionStore, getConnection, getValidAccessToken } from "@/lib/social";
import { linkedinPublisher, publishPinterest } from "@/lib/publishers";
import { uploadVideo } from "@/lib/youtube";

// Video upload to YouTube can take a bit; give the function room.
export const maxDuration = 300;
export const runtime = "nodejs";

// Platforms the shared publishToAll handles (LinkedIn is plugged below).
const UNION: SocialPlatform[] = ["facebook", "instagram", "threads", "linkedin"];

// Which platforms can carry each post type (a text-only post can't go to IG/Pinterest/YouTube, etc.).
const ELIGIBLE: Record<string, string[]> = {
  text: ["facebook", "threads", "linkedin"],
  image: ["facebook", "instagram", "threads", "linkedin", "pinterest"],
  video: ["youtube"],
};

/**
 * Publish the composed post to every selected platform, each with its own
 * AI-tailored caption. Union platforms go through the shared orchestrator;
 * Pinterest and YouTube are published directly.
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
  const posts = rawPosts
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

  const kind: "image" | "video" = type === "video" ? "video" : "image";
  const store = createConnectionStore(user.id);
  const results: PublishResult[] = [];

  for (const post of posts) {
    const content: PostContent = {
      caption: post.caption,
      title,
      link,
      media: type === "text" ? [] : [{ kind, url: mediaUrl }],
    };

    if ((UNION as string[]).includes(post.platform)) {
      const r = await publishToAll({
        platforms: [post.platform as SocialPlatform],
        content,
        connections: store,
        publishers: { linkedin: linkedinPublisher },
      });
      results.push(...r);
      continue;
    }

    if (post.platform === "pinterest") {
      const conn = await getConnection(user.id, "pinterest").catch(() => null);
      if (!conn) {
        results.push({ platform: "pinterest" as never, ok: false, error: "Pinterest isn't connected.", retryable: false });
      } else {
        results.push(
          await publishPinterest({
            accessToken: conn.access_token,
            boardId: conn.metadata?.boardId ?? conn.provider_account_id,
            content,
          }),
        );
      }
      continue;
    }

    if (post.platform === "youtube") {
      const conn = await getConnection(user.id, "youtube").catch(() => null);
      if (!conn) {
        results.push({ platform: "youtube" as never, ok: false, error: "YouTube isn't connected.", retryable: false });
        continue;
      }
      try {
        const accessToken = await getValidAccessToken(user.id, conn);
        const media = await fetch(mediaUrl);
        if (!media.ok) throw new Error(`Could not fetch the video (${media.status}).`);
        const contentType = media.headers.get("content-type") || "video/mp4";
        const bytes = new Uint8Array(await media.arrayBuffer());
        const videoId = await uploadVideo(accessToken, {
          bytes,
          contentType,
          title: title || "MarketingBoss video",
          description: post.caption,
          privacy: "public",
        });
        results.push({ platform: "youtube" as never, ok: true, externalId: videoId, url: `https://youtu.be/${videoId}` });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "YouTube publish failed.";
        results.push({ platform: "youtube" as never, ok: false, error: msg, retryable: false });
      }
    }
  }

  return NextResponse.json({ results });
}
