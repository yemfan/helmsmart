import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { remixForUser } from "@/lib/viralIntelligence";

export const maxDuration = 120;
export const runtime = "nodejs";

/** Remix a viral pattern into an ORIGINAL version for this user's business (optionally presented by a character). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  let characterId: string | null = null;
  try {
    const body = (await req.json()) as { characterId?: unknown };
    if (typeof body.characterId === "string" && body.characterId) characterId = body.characterId;
  } catch {
    /* optional body */
  }

  try {
    const remix = await remixForUser(user.id, id, characterId);
    return NextResponse.json({ ok: true, remix });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Remix failed — please try again." }, { status: 500 });
  }
}
