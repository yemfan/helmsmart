import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The digital twin — the user's own likeness and voice.
 *
 * Distinct from the Brand Kit on purpose. The brand kit is WHAT the marketing
 * says (name, voice-of-brand, audience, colours); the twin is WHO says it (a
 * face and a voice). A business with no on-camera presence has a brand kit and
 * no twin, and that has to be a valid state.
 *
 * Everything here is the user's own likeness, so `consent` is not decoration:
 * `assertRenderable()` is the gate every render path must pass through before
 * a face or a voice is put on screen.
 */

export type DigitalTwin = {
  user_id: string;
  portrait_url: string | null;
  intro_video_url: string | null;
  voice_id: string | null;
  voice_name: string | null;
  consent: boolean;
  consent_at: string | null;
  avatar_video_url: string | null;
  avatar_script: string | null;
  updated_at?: string;
};

export const TWIN_COLUMNS =
  "user_id, portrait_url, intro_video_url, voice_id, voice_name, consent, consent_at, avatar_video_url, avatar_script, updated_at";

/** Missing table (migration 0029 not applied yet) reads as "no twin", not a crash. */
function tableMissing(msg: string | undefined): boolean {
  const m = msg ?? "";
  return m.includes("digital_twins") && (m.includes("does not exist") || m.includes("schema cache"));
}

export async function getTwin(
  supabase: SupabaseClient,
  userId: string,
): Promise<DigitalTwin | null> {
  const { data, error } = await supabase
    .from("digital_twins")
    .select(TWIN_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (tableMissing(error.message)) return null;
    throw new Error(error.message);
  }
  return (data as DigitalTwin | null) ?? null;
}

/** Fields a user may change about their own twin. */
export type TwinPatch = Partial<
  Pick<
    DigitalTwin,
    "portrait_url" | "intro_video_url" | "voice_id" | "voice_name" | "consent" | "avatar_video_url" | "avatar_script"
  >
>;

export async function saveTwin(
  supabase: SupabaseClient,
  userId: string,
  patch: TwinPatch,
): Promise<DigitalTwin> {
  // Stamp the moment consent was given, and clear it if it is withdrawn — a
  // consent date that outlives the consent is worse than none at all.
  const row: Record<string, unknown> = { user_id: userId, ...patch };
  if (patch.consent === true) row.consent_at = new Date().toISOString();
  if (patch.consent === false) row.consent_at = null;

  const { data, error } = await supabase
    .from("digital_twins")
    .upsert(row, { onConflict: "user_id" })
    .select(TWIN_COLUMNS)
    .single();
  if (error) {
    if (tableMissing(error.message)) {
      throw new Error("The digital twin isn't set up on this database yet (migration 0029).");
    }
    throw new Error(error.message);
  }
  return data as DigitalTwin;
}

/**
 * Throw unless this twin may actually be rendered, with a message aimed at the
 * person rather than the developer.
 *
 * Called by every path that puts the user's face or voice on screen. Consent is
 * checked here rather than at each call site so a new render surface cannot
 * quietly skip it.
 */
export function assertRenderable(twin: DigitalTwin | null): asserts twin is DigitalTwin {
  if (!twin) throw new Error("Set up your twin first — add a photo and record your voice.");
  if (!twin.consent) {
    throw new Error("Confirm the photo and voice are your own before your twin can appear on camera.");
  }
  if (!twin.portrait_url) throw new Error("Your twin needs a photo before it can be filmed.");
}

/**
 * The voice this user may speak with: their own clone, or the default narrator.
 *
 * Deliberately narrow. `listVoices()` returns every voice on the shared
 * ElevenLabs account, which spans all users — handing that list to a picker is
 * how one person ends up speaking in another's cloned voice.
 */
export function twinVoiceId(twin: DigitalTwin | null): string {
  return twin?.voice_id?.trim() || "";
}
