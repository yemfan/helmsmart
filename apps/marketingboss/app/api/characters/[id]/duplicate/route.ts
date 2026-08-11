import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { duplicateCharacter } from "@/lib/characters";

export const runtime = "nodejs";

/** Duplicate a character — the "new era" path (Sarah → Sarah Luxury Edition). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  let name: string | undefined;
  try {
    const body = (await req.json()) as { name?: unknown };
    if (typeof body.name === "string") name = body.name;
  } catch {
    /* optional */
  }

  const character = await duplicateCharacter(user.id, id, name);
  if (!character) return NextResponse.json({ error: "Character not found." }, { status: 404 });
  return NextResponse.json({ ok: true, character });
}
