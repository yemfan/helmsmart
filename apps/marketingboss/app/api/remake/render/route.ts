import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CreditError } from "@/lib/generation";
import { renderRemake, quoteRemake } from "@/lib/remakeRender";
import type { RecastPlan } from "@/lib/adBlueprint";

/**
 * Every shot renders sequentially, and a Seedance clip alone can take minutes.
 * A five-shot ad is well past any single function's ceiling, so this is capped
 * at the platform maximum and the client is expected to use the notify-when-
 * done path rather than hold the request open.
 */
export const maxDuration = 800;
export const runtime = "nodejs";

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

  const plan = body.plan as RecastPlan | undefined;
  if (!plan || !Array.isArray(plan.shots) || !plan.shots.length) {
    return NextResponse.json({ error: "Write the plan first." }, { status: 400 });
  }

  const characterId = typeof body.characterId === "string" ? body.characterId.trim() : "";
  if (!characterId) {
    return NextResponse.json({ error: "Pick which of your characters appears in this." }, { status: 400 });
  }
  const voiceId = typeof body.voiceId === "string" ? body.voiceId.trim() : "";

  try {
    const out = await renderRemake(supabase, user.id, plan, { characterId, voiceId });
    return NextResponse.json({ ok: true, ...out });
  } catch (e: unknown) {
    if (e instanceof CreditError) {
      return NextResponse.json(
        { error: `${e.message} Top up to keep creating.`, quote: quoteRemake(plan), credits: 0 },
        { status: 402 },
      );
    }
    const msg = e instanceof Error ? e.message : "";
    if (/balance|locked/i.test(msg)) {
      return NextResponse.json(
        { error: "The generation account is out of credits. Please top up fal.ai billing." },
        { status: 402 },
      );
    }
    if (/FAL_KEY/.test(msg)) {
      return NextResponse.json({ error: "Server is not configured (missing FAL_KEY)." }, { status: 503 });
    }
    // Plan-shaped refusals are already written for the user.
    if (/no words|no scene description|not found|no picture/i.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[remake/render] failed:", msg);
    return NextResponse.json(
      { error: "The ad couldn't be finished. Any shots that rendered were still charged — try again." },
      { status: 500 },
    );
  }
}
