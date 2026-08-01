import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getConnection, getValidAccessToken } from "@/lib/social";
import { uploadVideo, type Privacy } from "@/lib/youtube";

// Uploading a video to YouTube can take a bit; give it room.
export const maxDuration = 300;
export const runtime = "nodejs";

const PRIVACIES: Privacy[] = ["private", "unlisted", "public"];

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

  const mediaUrl = typeof body.url === "string" ? body.url : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description : "";
  const privacy: Privacy = PRIVACIES.includes(body.privacy as Privacy)
    ? (body.privacy as Privacy)
    : "unlisted";

  // SSRF guard: only publish media that lives in OUR Supabase Storage.
  const storagePrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/`;
  if (!mediaUrl || !storagePrefix || !mediaUrl.startsWith(storagePrefix)) {
    return NextResponse.json({ error: "Unknown media URL." }, { status: 400 });
  }

  const conn = await getConnection(user.id, "youtube").catch(() => null);
  if (!conn) {
    return NextResponse.json({ error: "Connect your YouTube channel first.", needsConnect: true }, { status: 400 });
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
      description,
      privacy,
    });

    return NextResponse.json({ videoId, url: `https://youtu.be/${videoId}` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Publish failed.";
    // Auth problems → tell the client to reconnect.
    if (/invalid_grant|unauthorized|401|invalid credentials/i.test(msg)) {
      return NextResponse.json({ error: "YouTube access expired — please reconnect.", needsConnect: true }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
