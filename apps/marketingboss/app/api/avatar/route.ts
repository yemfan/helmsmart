import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AVATAR_CREDIT, AvatarCreditError, buildTalkingAvatar } from "@/lib/avatar";
import { MAX_SCRIPT_CHARS } from "@/lib/voiceover";

/**
 * A talking-head render measured at 47s for a short line. 600s leaves room for
 * a long script and sits above the library's own 480s give-up, so a timeout is
 * ours and the credits go back — a Vercel timeout is a SIGKILL that skips the
 * refund entirely.
 */
export const maxDuration = 600;
export const runtime = "nodejs";

/** Make one of the user's characters say something, on camera. */
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

  const characterId = typeof body.characterId === "string" ? body.characterId.trim() : "";
  const script = typeof body.script === "string" ? body.script.trim() : "";
  const voiceId = typeof body.voiceId === "string" ? body.voiceId.trim() : "";

  if (!characterId) return NextResponse.json({ error: "Pick a character." }, { status: 400 });
  if (!script) return NextResponse.json({ error: "Write what they should say." }, { status: 400 });
  if (script.length > MAX_SCRIPT_CHARS) {
    return NextResponse.json(
      { error: `Keep it under ${MAX_SCRIPT_CHARS} characters — this is a short read, not a monologue.` },
      { status: 400 },
    );
  }

  try {
    const out = await buildTalkingAvatar(supabase, user.id, characterId, script, voiceId);
    return NextResponse.json({ url: out.url, credits: out.credits, cost: AVATAR_CREDIT });
  } catch (e) {
    if (e instanceof AvatarCreditError) {
      return NextResponse.json({ error: `${e.message} Top up to keep creating.`, credits: 0 }, { status: 402 });
    }
    const msg = e instanceof Error ? e.message : "The talking video failed.";
    // These two name something the user can actually fix, so pass them through.
    if (/no picture yet|was not found/i.test(msg)) return NextResponse.json({ error: msg }, { status: 400 });
    if (/balance|locked/i.test(msg))
      return NextResponse.json(
        { error: "The generation account is out of credits. Please top up fal.ai billing." },
        { status: 402 },
      );
    if (/FAL_KEY/.test(msg))
      return NextResponse.json({ error: "Server is not configured (missing FAL_KEY)." }, { status: 503 });
    if (/timed out/i.test(msg))
      return NextResponse.json(
        { error: "That render took longer than we waited for. Your credits were returned — try a shorter script." },
        { status: 504 },
      );
    // Never echo the provider payload — log it, show a sentence.
    console.error("[avatar] failed:", msg);
    return NextResponse.json(
      {
        error:
          "That video couldn't be made. Your credits were returned — a clear, front-facing picture works best.",
      },
      { status: 502 },
    );
  }
}
