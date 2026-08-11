import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { archiveCharacter, getCharacter, updateCharacter, type CharacterDna } from "@/lib/characters";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  const character = await getCharacter(user.id, id);
  if (!character) return NextResponse.json({ error: "Character not found." }, { status: 404 });
  return NextResponse.json({ ok: true, character });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  try {
    const character = await updateCharacter(user.id, id, {
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : undefined,
      role: typeof body.role === "string" ? body.role : undefined,
      collection: typeof body.collection === "string" ? body.collection : undefined,
      dna: body.dna ? (body.dna as CharacterDna) : undefined,
    });
    if (!character) return NextResponse.json({ error: "Character not found." }, { status: 404 });
    return NextResponse.json({ ok: true, character });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed." }, { status: 500 });
  }
}

/** Archive (characters referenced by assets are never hard-deleted). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  await archiveCharacter(user.id, id);
  return NextResponse.json({ ok: true });
}
