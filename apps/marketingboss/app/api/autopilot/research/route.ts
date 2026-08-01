import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured } from "@/lib/ai";
import { buildBrandBrief } from "@/lib/research";

// Web research + two model passes; give it room.
export const maxDuration = 300;
export const runtime = "nodejs";

/** Research a link → a structured brand brief (not saved yet). */
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

  const link = typeof body.link === "string" ? body.link.trim() : "";
  if (!/^https?:\/\/.+\..+/.test(link)) {
    return NextResponse.json({ error: "Enter a full link, e.g. https://yourbusiness.com." }, { status: 400 });
  }

  try {
    const brief = await buildBrandBrief(link);
    return NextResponse.json({ brief });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Research failed.";
    const status = /ANTHROPIC_API_KEY/.test(msg) ? 503 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
