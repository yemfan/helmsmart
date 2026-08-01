import { NextResponse } from "next/server";
import { type GenType } from "@/lib/fal";
import { createClient } from "@/lib/supabase/server";
import { generateAndStore, CreditError } from "@/lib/generation";

// Video can take a couple minutes; give the function room (Vercel default 300s).
export const maxDuration = 300;
export const runtime = "nodejs";

const ASPECTS = new Set(["16:9", "9:16", "1:1", "4:3", "3:4"]);

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

  const type = (body.type === "video" ? "video" : "image") as GenType;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const aspect = typeof body.aspect === "string" && ASPECTS.has(body.aspect) ? body.aspect : "16:9";
  const model = typeof body.model === "string" && body.model ? body.model : undefined;
  const imageUrl =
    typeof body.imageUrl === "string" && /^https?:\/\//.test(body.imageUrl) ? body.imageUrl : undefined;

  if (!prompt) return NextResponse.json({ error: "A prompt is required." }, { status: 400 });
  if (prompt.length > 2000)
    return NextResponse.json({ error: "Prompt is too long (max 2000 chars)." }, { status: 400 });

  try {
    const out = await generateAndStore(supabase, user.id, { type, prompt, aspect, model, imageUrl });
    return NextResponse.json({ urls: out.urls, model: out.model, credits: out.credits });
  } catch (e: unknown) {
    if (e instanceof CreditError) {
      return NextResponse.json({ error: `${e.message} Top up to keep creating.`, credits: 0 }, { status: 402 });
    }
    const msg = e instanceof Error ? e.message : "Generation failed.";
    if (/balance|locked/i.test(msg))
      return NextResponse.json(
        { error: "The generation account is out of credits. Please top up fal.ai billing." },
        { status: 402 },
      );
    if (/FAL_KEY/.test(msg))
      return NextResponse.json({ error: "Server is not configured (missing FAL_KEY)." }, { status: 503 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
