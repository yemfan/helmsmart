import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCharacter, setCharacterPortrait, updateCharacter } from "@/lib/characters";
import { generateAndStore, CreditError } from "@/lib/generation";

export const maxDuration = 120;
export const runtime = "nodejs";

/**
 * Generate the character's canonical portrait (1 credit) — it becomes
 * reference_images[0], the identity anchor every later render builds on.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const character = await getCharacter(user.id, id);
  if (!character) return NextResponse.json({ error: "Character not found." }, { status: 404 });

  const prompt = [
    `Character reference portrait: ${character.prompt_profile ?? character.name}.`,
    "Head-and-shoulders, facing camera, soft even studio lighting, neutral clean background,",
    "photorealistic quality (stylized only if the character is a robot/creature/mascot),",
    "no text, no watermark, no logo.",
  ].join(" ");

  try {
    const { urls } = await generateAndStore(supabase, user.id, { type: "image", prompt, aspect: "1:1" });
    const url = urls[0];
    if (!url) throw new Error("Generation returned no image — please try again.");
    await setCharacterPortrait(user.id, id, url);
    // Asset traceability: tag the generations row this render created.
    const admin = createAdminClient();
    await admin.from("generations").update({ character_id: id }).eq("user_id", user.id).eq("media_url", url);
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    if (e instanceof CreditError) {
      return NextResponse.json({ error: "Not enough credits — a portrait costs 1 credit." }, { status: 402 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Portrait generation failed." }, { status: 500 });
  }
}

/**
 * Use a PHOTO as the character's canonical portrait instead of generating one.
 *
 * Verified end to end on 2026-08-19: a real head-and-shoulders photo handed to
 * seedance-2.0/reference-to-video came back as a usable 10s vertical ad with
 * the face, hair and wardrobe intact. Worth knowing before relying on it:
 * seedance 2.5 REFUSES face references outright, so an uploaded human tops out
 * at 2.0's 15s rather than 2.5's 30s.
 *
 * A photo of a person is a likeness, so this path is gated. It forces
 * identity_type to `real_person` and demands a consent note naming who they are
 * and that they agreed — the generated ad will show their face saying words
 * they never said, and "the schema had a field for it" is not consent.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const url = typeof body.url === "string" ? body.url.trim() : "";
  const consentNote = typeof body.consentNote === "string" ? body.consentNote.trim() : "";

  // The photo must live in OUR Storage. Accepting an arbitrary URL would let a
  // caller point the renderer at anything on the internet through our key.
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/`;
  if (prefix === "/storage/" || !url.startsWith(prefix)) {
    return NextResponse.json({ error: "Upload the photo here rather than pasting a link." }, { status: 400 });
  }
  if (consentNote.length < 10) {
    return NextResponse.json(
      { error: "Say whose photo this is and that they agreed to it being used in AI-generated ads." },
      { status: 400 },
    );
  }

  const character = await getCharacter(user.id, id);
  if (!character) return NextResponse.json({ error: "Character not found." }, { status: 404 });

  try {
    await setCharacterPortrait(user.id, id, url);
    await updateCharacter(user.id, id, {
      identityType: "real_person",
      consentNote: consentNote.slice(0, 500),
    });
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save that photo." },
      { status: 500 },
    );
  }
}
