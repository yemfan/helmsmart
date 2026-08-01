import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adaptForPlatforms, aiConfigured, type Draft } from "@/lib/ai";

export const maxDuration = 60;
export const runtime = "nodejs";

// Every platform the composer can tailor copy for.
const KNOWN = ["facebook", "instagram", "threads", "linkedin", "pinterest", "youtube"];

/** Draft + selected platforms → one caption tailored per platform (the preview). */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI copywriting isn't set up yet (missing ANTHROPIC_API_KEY)." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const draft = body.draft as Draft | undefined;
  if (!draft || typeof draft.caption !== "string") {
    return NextResponse.json({ error: "Missing the draft to tailor." }, { status: 400 });
  }
  const link = typeof body.link === "string" && /^https?:\/\//.test(body.link) ? body.link : null;
  const platforms = Array.isArray(body.platforms)
    ? (body.platforms.filter((p) => KNOWN.includes(p as string)) as string[])
    : [];
  if (platforms.length === 0) return NextResponse.json({ error: "Pick at least one platform." }, { status: 400 });

  try {
    const posts = await adaptForPlatforms(draft, link, platforms);
    return NextResponse.json({ posts });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not build the preview.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
