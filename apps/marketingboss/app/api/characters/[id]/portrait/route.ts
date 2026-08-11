import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCharacter, setCharacterPortrait } from "@/lib/characters";
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
