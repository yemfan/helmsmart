import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTwin, saveTwin, type TwinPatch } from "@/lib/digitalTwin";

export const runtime = "nodejs";

/**
 * Read and update the signed-in user's digital twin.
 *
 * Only the owner's row is ever touched — `user.id` comes from the session, not
 * the body, so there is no id a caller could substitute for someone else's.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  try {
    return NextResponse.json({ ok: true, twin: await getTwin(supabase, user.id) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't load your twin." },
      { status: 500 },
    );
  }
}

/** Fields the owner may set. Anything else in the body is ignored. */
const STRING_FIELDS = [
  "portrait_url",
  "intro_video_url",
  "voice_id",
  "voice_name",
  "avatar_video_url",
  "avatar_script",
] as const;

export async function PATCH(req: Request) {
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

  const patch: TwinPatch = {};
  for (const key of STRING_FIELDS) {
    const v = body[key];
    // null is meaningful — it clears a field. undefined means "leave alone".
    if (v === null) patch[key] = null;
    else if (typeof v === "string") patch[key] = v.trim() || null;
  }
  if (typeof body.consent === "boolean") patch.consent = body.consent;

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  try {
    return NextResponse.json({ ok: true, twin: await saveTwin(supabase, user.id, patch) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't save your twin." },
      { status: 500 },
    );
  }
}
