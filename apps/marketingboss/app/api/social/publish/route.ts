import { NextResponse } from "next/server";
import { publishToAll, type PostContent, type PublishResult, type SocialPlatform } from "@helm/dna-marketing";
import { createClient } from "@/lib/supabase/server";
import { createConnectionStore, getConnection } from "@/lib/social";
import { linkedinPublisher, publishPinterest } from "@/lib/publishers";

export const maxDuration = 120;
export const runtime = "nodejs";

// Platforms the shared publishToAll handles (LinkedIn is plugged below).
const UNION: SocialPlatform[] = ["facebook", "instagram", "threads", "linkedin"];
const ALL = [...UNION, "pinterest"] as const;

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
  const kind = body.kind === "video" ? "video" : "image";
  const caption = typeof body.caption === "string" ? body.caption : "";
  const title = typeof body.title === "string" ? body.title : undefined;
  const requested = Array.isArray(body.platforms)
    ? (body.platforms.filter((p) => (ALL as readonly string[]).includes(p as string)) as string[])
    : [];

  if (requested.length === 0) return NextResponse.json({ error: "Pick at least one platform." }, { status: 400 });

  // SSRF guard: only publish media that lives in OUR Supabase Storage.
  const storagePrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/`;
  if (!mediaUrl || !storagePrefix || !mediaUrl.startsWith(storagePrefix)) {
    return NextResponse.json({ error: "Unknown media URL." }, { status: 400 });
  }

  const content: PostContent = {
    caption,
    title,
    media: [{ kind, url: mediaUrl }],
  };

  const results: PublishResult[] = [];

  // Union platforms via the shared orchestrator (LinkedIn plugged).
  const unionSelected = requested.filter((p): p is SocialPlatform => (UNION as string[]).includes(p));
  if (unionSelected.length) {
    const store = createConnectionStore(user.id);
    const r = await publishToAll({
      platforms: unionSelected,
      content,
      connections: store,
      publishers: { linkedin: linkedinPublisher },
    });
    results.push(...r);
  }

  // Pinterest (not in the package platform union yet) — published directly.
  if (requested.includes("pinterest")) {
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
  }

  return NextResponse.json({ results });
}
