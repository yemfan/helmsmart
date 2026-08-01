import { NextResponse } from "next/server";
import { generate, type GenType } from "@/lib/fal";
import { createClient } from "@/lib/supabase/server";

// Video can take a couple minutes; give the function room (Vercel default 300s).
export const maxDuration = 300;
export const runtime = "nodejs";

const ASPECTS = new Set(["16:9", "9:16", "1:1", "4:3", "3:4"]);

function extFrom(url: string, type: GenType): { ext: string; contentType: string } {
  const m = url.split("?")[0].match(/\.(\w{2,4})$/);
  const ext = (m?.[1] || (type === "video" ? "mp4" : "jpg")).toLowerCase();
  const contentType =
    type === "video"
      ? "video/mp4"
      : ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/jpeg";
  return { ext, contentType };
}

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

  // Credit cost, weighted by what the model actually costs on fal.ai.
  const cost = type === "video" ? 20 : imageUrl ? 2 : 1;

  // Reserve credits up front (atomic); refund below if generation fails.
  const { data: remaining, error: creditErr } = await supabase.rpc("consume_credits", {
    p_cost: cost,
  });
  if (creditErr) return NextResponse.json({ error: "Could not check credits." }, { status: 500 });
  if (typeof remaining !== "number" || remaining < 0) {
    return NextResponse.json(
      { error: `Not enough credits — this costs ${cost}. Top up to keep creating.`, credits: 0 },
      { status: 402 },
    );
  }

  try {
    const result = await generate({ type, prompt, aspect, model, imageUrl });

    // Persist each rendered asset to Storage (fal URLs are ephemeral) and record it.
    const savedUrls: string[] = [];
    for (const src of result.urls) {
      const media = await fetch(src);
      if (!media.ok) throw new Error(`Could not fetch rendered media (${media.status}).`);
      const bytes = new Uint8Array(await media.arrayBuffer());
      const { ext, contentType } = extFrom(src, type);
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(path, bytes, { contentType, upsert: false });
      if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

      const publicUrl = supabase.storage.from("media").getPublicUrl(path).data.publicUrl;

      const { error: dbErr } = await supabase.from("generations").insert({
        user_id: user.id,
        type,
        prompt,
        model: result.model,
        aspect,
        media_url: publicUrl,
      });
      if (dbErr) throw new Error(`Save failed: ${dbErr.message}`);

      savedUrls.push(publicUrl);
    }

    return NextResponse.json({ urls: savedUrls, model: result.model, credits: remaining });
  } catch (e: unknown) {
    // Generation failed after reserving credits — refund them (best-effort).
    await supabase.rpc("consume_credits", { p_cost: -cost });
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
