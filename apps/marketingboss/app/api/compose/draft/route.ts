import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured, draftPost, type PostType } from "@/lib/ai";

export const maxDuration = 60;
export const runtime = "nodejs";

const TYPES: PostType[] = ["text", "image", "video"];

/** Intent + type → an AI-written draft (title, caption, CTA, hashtags, media prompt). */
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

  const intent = typeof body.intent === "string" ? body.intent.trim() : "";
  const type = (TYPES.includes(body.type as PostType) ? body.type : "image") as PostType;
  if (!intent) return NextResponse.json({ error: "Tell me what you want to post about." }, { status: 400 });
  if (intent.length > 1500) return NextResponse.json({ error: "That's a bit long — keep it under 1500 characters." }, { status: 400 });

  try {
    const draft = await draftPost(intent, type);
    return NextResponse.json({ draft });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not write the draft.";
    const status = /ANTHROPIC_API_KEY/.test(msg) ? 503 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
