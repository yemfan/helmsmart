import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderTalkingVideo, AvatarCreditError, AVATAR_CREDIT } from "@/lib/avatar";
import { assertRenderable, getTwin, saveTwin, twinVoiceId } from "@/lib/digitalTwin";
import { MAX_SCRIPT_CHARS } from "@/lib/voiceover";

// Fabric measured at 47s for a short line; the ceiling is headroom for a longer
// script and sits under the route's own limit so the refund still runs.
export const maxDuration = 800;
export const runtime = "nodejs";

/**
 * Film the user's twin saying something.
 *
 * The voice is theirs or the default narrator — never the shared ElevenLabs
 * list. `listVoices()` spans every user of the account, so offering it here is
 * how one person ends up speaking in another's cloned voice.
 */
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

  const script = typeof body.script === "string" ? body.script.trim().slice(0, MAX_SCRIPT_CHARS) : "";
  if (!script) return NextResponse.json({ error: "Write a few words for your twin to say." }, { status: 400 });

  try {
    const twin = await getTwin(supabase, user.id);
    // Throws with a message written for the user — consent, photo, or setup.
    assertRenderable(twin);

    const out = await renderTalkingVideo(supabase, user.id, {
      portraitUrl: twin.portrait_url!,
      script,
      voiceId: twinVoiceId(twin),
      label: "Your twin says",
    });

    // Keep the latest render on the twin so the profile shows it rather than
    // only describing it.
    await saveTwin(supabase, user.id, { avatar_video_url: out.url, avatar_script: script });

    return NextResponse.json({ ok: true, url: out.url, credits: out.credits });
  } catch (e: unknown) {
    if (e instanceof AvatarCreditError) {
      return NextResponse.json(
        { error: `${e.message} Top up to keep creating.`, cost: AVATAR_CREDIT, credits: 0 },
        { status: 402 },
      );
    }
    const msg = e instanceof Error ? e.message : "";
    // Setup and consent refusals are already written for the person.
    if (/twin|consent|photo|voice/i.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (/balance|locked/i.test(msg)) {
      return NextResponse.json(
        { error: "The generation account is out of credits. Please top up fal.ai billing." },
        { status: 402 },
      );
    }
    if (/FAL_KEY|ELEVENLABS/i.test(msg)) {
      return NextResponse.json({ error: "Server is not configured for this yet." }, { status: 503 });
    }
    console.error("[twin/video] failed:", msg);
    return NextResponse.json(
      { error: "That video couldn't be filmed. Your credits were returned — try again." },
      { status: 500 },
    );
  }
}
