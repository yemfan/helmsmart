import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured } from "@/lib/ai";
import { getCharacter } from "@/lib/characters";
import { recastForTwin, type AdBlueprint } from "@/lib/adBlueprint";

// One Claude call over the blueprint — no media work.
export const maxDuration = 120;
export const runtime = "nodejs";

/**
 * Turn a blueprint into shot-by-shot instructions for the user's own twin.
 *
 * Nothing renders here and no credits are spent. The plan comes back for review
 * first because it decides where money goes next: every shot it marks "avatar"
 * is a Fabric render and every "scene" is a Seedance one, and the user should
 * see that split — and the words they are about to be filmed saying — before
 * either happens.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI isn't configured on the server." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const blueprint = body.blueprint as AdBlueprint | undefined;
  if (!blueprint || !Array.isArray(blueprint.shots) || !blueprint.shots.length) {
    return NextResponse.json({ error: "Analyse a reference video first." }, { status: 400 });
  }

  const characterId = typeof body.characterId === "string" ? body.characterId.trim() : "";
  if (!characterId) {
    return NextResponse.json({ error: "Pick which of your characters appears in this." }, { status: 400 });
  }

  // Scoped to this user — getCharacter filters by owner, so another account's
  // likeness cannot be recast by guessing an id.
  const twin = await getCharacter(user.id, characterId);
  if (!twin) return NextResponse.json({ error: "That character was not found." }, { status: 404 });

  const context = {
    business: typeof body.business === "string" ? body.business.slice(0, 500) : undefined,
    market: typeof body.market === "string" ? body.market.slice(0, 300) : undefined,
    offer: typeof body.offer === "string" ? body.offer.slice(0, 500) : undefined,
  };

  try {
    const plan = await recastForTwin(blueprint, twin, context);
    return NextResponse.json({ ok: true, plan });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    // The consent and missing-photo refusals are written for the user already.
    if (/real person|no photo/i.test(msg)) return NextResponse.json({ error: msg }, { status: 400 });
    console.error("[remake/recast] failed:", msg);
    return NextResponse.json(
      { error: msg || "That plan couldn't be written. Try again in a moment." },
      { status: 500 },
    );
  }
}
