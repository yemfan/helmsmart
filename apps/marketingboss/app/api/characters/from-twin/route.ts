import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTwin } from "@/lib/digitalTwin";
import { BRAND_KIT_COLUMNS, type BrandKit } from "@/lib/brandKit";
import { createCharacter, listCharacters } from "@/lib/characters";

export const runtime = "nodejs";

/** The name we give the character, and the marker we recognise it by later. */
const TWIN_ROLE = "Your brand persona";

/**
 * Turn the user's digital twin into a character.
 *
 * The app had two separate ideas of "you" that did not know about each other:
 * the twin at /profile (portrait, cloned voice, consent) and a Character Studio
 * cast list. Everything downstream of a remake - recastForTwin,
 * buildTalkingAvatar - is keyed on a character, so a user who had set up a twin
 * still found an empty "choose your on-camera twin" dropdown and was asked to
 * describe themselves a second time in a different vocabulary.
 *
 * Created as `brand_owned`, not `real_person`: the portrait is generated, so it
 * is a company asset rather than a photograph. The consent note is still
 * mandatory and still names the real person, because a synthetic likeness of a
 * real human carries the same likeness obligations as a photograph of them -
 * owning the asset is not the same as there being nobody in it.
 *
 * Idempotent, and explicit: the user presses a button. A character appears in
 * their cast list, so it should not materialise on its own.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const twin = await getTwin(supabase, user.id).catch(() => null);
  if (!twin?.portrait_url?.trim()) {
    return NextResponse.json(
      { error: "Add a photo to your twin first — that's the face this character wears." },
      { status: 400 },
    );
  }
  if (!twin.consent) {
    return NextResponse.json(
      {
        error:
          "Tick the consent box on your profile first. A character that can be put on camera needs a record of who agreed to it.",
      },
      { status: 400 },
    );
  }

  // Already done? Hand back the existing one rather than growing a cast of
  // duplicates every time the button is pressed.
  const existing = (await listCharacters(user.id).catch(() => []))
    .find((c) => c.role === TWIN_ROLE && (c.reference_images ?? []).includes(twin.portrait_url!));
  if (existing) return NextResponse.json({ ok: true, character: existing, reused: true });

  let brand: BrandKit | null = null;
  try {
    const { data } = await supabase
      .from("brand_kits")
      .select(BRAND_KIT_COLUMNS)
      .eq("user_id", user.id)
      .maybeSingle();
    brand = data as BrandKit | null;
  } catch {
    /* no brand kit - the twin still has a name to go by */
  }

  const name = (brand?.brand_name?.trim() || user.email?.split("@")[0] || "My twin").slice(0, 120);

  try {
    const character = await createCharacter(user.id, {
      name,
      type: "human",
      role: TWIN_ROLE,
      identityType: "brand_owned",
      brandLinked: true,
      referenceImages: [twin.portrait_url],
      consentNote: `Brand persona of ${name}. The portrait is generated; the likeness and the cloned voice are the account owner's own, confirmed via the consent checkbox on their profile${twin.consent_at ? ` on ${twin.consent_at.slice(0, 10)}` : ""}.`,
      dna: {
        appearance: {},
        style: {},
        personality: brand?.voice?.trim() ? { communicationStyle: brand.voice.trim().slice(0, 300) } : {},
        // The voice is a real clone on ElevenLabs; the DNA block is descriptive
        // only, so record which clone speaks rather than inventing a timbre.
        voice: twin.voice_name?.trim() ? { clonedVoice: twin.voice_name.trim() } : {},
        professional: brand?.audience?.trim() ? { audience: brand.audience.trim().slice(0, 300) } : {},
      },
    });
    return NextResponse.json({ ok: true, character, reused: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Couldn't create that character.";
    if (/migration 0023|isn't set up/i.test(msg)) return NextResponse.json({ error: msg }, { status: 503 });
    console.error("[characters/from-twin] failed:", msg);
    return NextResponse.json({ error: "Couldn't create the character just now." }, { status: 500 });
  }
}
