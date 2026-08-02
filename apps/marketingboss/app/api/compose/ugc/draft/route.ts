import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured, draftUgcAd } from "@/lib/ai";

export const maxDuration = 60;
export const runtime = "nodejs";

/** Intent → an AI UGC ad script + a Seedance-ready video prompt. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI isn't set up yet (missing ANTHROPIC_API_KEY)." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const intent = typeof body.intent === "string" ? body.intent.trim() : "";
  const hasReference = body.hasReference === true;
  if (!intent) return NextResponse.json({ error: "Tell me what the ad is about." }, { status: 400 });
  if (intent.length > 1500) return NextResponse.json({ error: "Keep it under 1500 characters." }, { status: 400 });

  try {
    const ad = await draftUgcAd(intent, hasReference);
    return NextResponse.json({ ad });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not write the ad.";
    return NextResponse.json({ error: msg }, { status: /ANTHROPIC_API_KEY/.test(msg) ? 503 : 500 });
  }
}
