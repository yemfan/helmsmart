import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { composeCharacter, createCharacter, listCharacters, type CharacterType } from "@/lib/characters";

export const maxDuration = 60;
export const runtime = "nodejs";

const TYPES = new Set(["human", "animal", "robot", "creature", "mascot"]);

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, characters: await listCharacters(user.id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load characters." }, { status: 500 });
  }
}

/**
 * Create a character. mode 'ai': { description, type } → composed DNA.
 * mode 'direct': full CreateCharacterInput-ish payload (used by the wizard
 * after the user reviews/edits the AI draft).
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

  const type = typeof body.type === "string" && TYPES.has(body.type) ? (body.type as CharacterType) : "human";

  try {
    if (body.mode === "ai") {
      const description = typeof body.description === "string" ? body.description.trim() : "";
      if (!description) return NextResponse.json({ error: "Describe the character first." }, { status: 400 });
      const composed = await composeCharacter(description.slice(0, 1000), type);
      // Preview only — the client shows it for review, then POSTs mode 'direct'.
      return NextResponse.json({ ok: true, composed });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const dna = body.dna as Record<string, Record<string, string>> | undefined;
    if (!name || !dna) return NextResponse.json({ error: "A name and character DNA are required." }, { status: 400 });
    const identityType =
      body.identityType === "real_person" || body.identityType === "brand_owned" ? body.identityType : "fictional";
    if (identityType === "real_person" && !(typeof body.consentNote === "string" && body.consentNote.trim())) {
      return NextResponse.json(
        { error: "Real-person characters need a consent note (who authorized this likeness)." },
        { status: 400 },
      );
    }
    const character = await createCharacter(user.id, {
      name,
      type,
      role: typeof body.role === "string" ? body.role : null,
      collection: typeof body.collection === "string" && body.collection.trim() ? body.collection.trim() : null,
      dna: {
        appearance: dna.appearance ?? {},
        style: dna.style ?? {},
        personality: dna.personality ?? {},
        voice: dna.voice ?? {},
        professional: dna.professional ?? {},
      },
      identityType,
      consentNote: typeof body.consentNote === "string" ? body.consentNote : null,
    });
    return NextResponse.json({ ok: true, character });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't create the character." }, { status: 500 });
  }
}
