import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { insertScheduledPost } from "@/lib/campaigns";

export const runtime = "nodejs";

const ELIGIBLE: Record<string, string[]> = {
  text: ["facebook", "threads", "linkedin"],
  image: ["facebook", "instagram", "threads", "linkedin", "pinterest"],
  video: ["youtube", "tiktok"],
};

/** Schedule a one-off composed post to go out later (drained by the cron). */
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
  const link = typeof body.link === "string" && /^https?:\/\//.test(body.link) ? body.link : null;
  const title = typeof body.title === "string" ? body.title.trim() : null;
  const caption = typeof body.caption === "string" ? body.caption : "";
  const hashtags = (Array.isArray(body.hashtags) ? body.hashtags : []).filter((h) => typeof h === "string") as string[];
  const scheduledFor = typeof body.scheduledFor === "string" ? body.scheduledFor : "";

  const eligible = ELIGIBLE[type];
  const posts = (Array.isArray(body.posts) ? body.posts : [])
    .map((p) => p as { platform?: unknown; caption?: unknown })
    .filter((p) => typeof p.platform === "string" && typeof p.caption === "string" && eligible.includes(p.platform))
    .map((p) => ({ platform: p.platform as string, caption: p.caption as string }));
  if (posts.length === 0) return NextResponse.json({ error: "Pick at least one channel." }, { status: 400 });

  const when = Date.parse(scheduledFor);
  if (!Number.isFinite(when) || when < Date.now() + 60_000) {
    return NextResponse.json({ error: "Pick a time at least a minute from now." }, { status: 400 });
  }

  // Media-bearing posts must reference OUR Storage, and must already be rendered.
  if (type !== "text") {
    const storagePrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/`;
    if (!mediaUrl || storagePrefix === "/storage/" || !mediaUrl.startsWith(storagePrefix)) {
      return NextResponse.json({ error: "Generate the media before scheduling." }, { status: 400 });
    }
  }

  const perPlatform: Record<string, string> = {};
  for (const p of posts) perPlatform[p.platform] = p.caption;

  try {
    const post = await insertScheduledPost(user.id, {
      type,
      title,
      caption,
      hashtags,
      link,
      mediaUrl: type === "text" ? null : mediaUrl,
      perPlatform,
      channels: posts.map((p) => p.platform),
      scheduledFor: new Date(when).toISOString(),
    });
    return NextResponse.json({ post });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not schedule." }, { status: 500 });
  }
}
