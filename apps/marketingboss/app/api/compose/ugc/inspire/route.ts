import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured } from "@/lib/ai";
import { findViralAds } from "@/lib/viral";

// Web search + a distill pass can take a while.
export const maxDuration = 120;
export const runtime = "nodejs";

/** Intent → a shortlist of currently-trending UGC ad formats to emulate. */
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
  if (!intent) return NextResponse.json({ error: "Describe the product first." }, { status: 400 });
  if (intent.length > 1500) return NextResponse.json({ error: "Keep it under 1500 characters." }, { status: 400 });

  try {
    const refs = await findViralAds(intent);
    return NextResponse.json({ refs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not find references.";
    return NextResponse.json({ error: msg }, { status: /ANTHROPIC_API_KEY/.test(msg) ? 503 : 500 });
  }
}
