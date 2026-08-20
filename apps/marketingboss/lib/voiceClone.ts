import "server-only";

/**
 * Clone a voice from a sample — the voice half of a digital twin.
 *
 * The point of the twin is that ads sound like the person whose business it is,
 * not a stock narrator. Once a voice exists in the ElevenLabs account it needs
 * no further wiring: `listVoices` in lib/voiceover reads the account, so a clone
 * shows up in the narrator picker on the next open, sorted to the top.
 *
 * Ported from CloseBoss (lib/agent-voice/cloneProvider.ts), which runs this same
 * request in production, rather than written fresh against the docs.
 */

const ELEVEN_ADD_VOICE = "https://api.elevenlabs.io/v1/voices/add";

/** ElevenLabs extracts audio from video too, so an intro clip is a valid sample. */
const SAMPLE_EXTS = ["mp3", "wav", "webm", "m4a", "ogg", "flac", "mp4", "mov"];

/** Instant cloning wants a real sample; a few seconds of speech is not enough. */
export const MIN_SAMPLE_BYTES = 60 * 1024;
/** ElevenLabs rejects very large uploads, and a long sample buys nothing. */
export const MAX_SAMPLE_BYTES = 25 * 1024 * 1024;

export function voiceCloningConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

/**
 * Create a voice from `bytes`, returning its id.
 *
 * Failures are translated rather than forwarded: the overwhelmingly common one
 * is an ElevenLabs plan that does not include cloning, which is a billing
 * problem the user can fix and not something to retry.
 */
export async function cloneVoice(params: {
  name: string;
  // Uint8Array<ArrayBuffer>, not plain Uint8Array: the default arg is
  // ArrayBufferLike, which Blob rejects because it may be shared.
  bytes: Uint8Array<ArrayBuffer>;
  filename: string;
  mimeType: string;
}): Promise<string> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error("ELEVENLABS_API_KEY is not configured.");

  const form = new FormData();
  form.append("name", params.name.slice(0, 60));
  form.append("description", "MarketingBoss digital twin");
  // ElevenLabs sniffs the bytes, but keep the multipart filename honest.
  const lower = params.filename.toLowerCase();
  const mime = params.mimeType.toLowerCase();
  const ext = SAMPLE_EXTS.find((e) => lower.endsWith(`.${e}`) || mime.includes(e)) ?? "mp3";
  form.append("files", new Blob([params.bytes], { type: params.mimeType || "audio/mpeg" }), `sample.${ext}`);

  const res = await fetch(ELEVEN_ADD_VOICE, { method: "POST", headers: { "xi-api-key": key }, body: form });
  const text = await res.text();

  if (!res.ok) {
    let friendly = "";
    try {
      const j = JSON.parse(text) as { detail?: { status?: string; code?: string; message?: string } };
      const d = j.detail;
      if (d?.code === "paid_plan_required" || d?.status === "can_not_use_instant_voice_cloning") {
        friendly =
          "Voice cloning needs a paid ElevenLabs plan (Starter or higher). Upgrade there and try again — nothing here needs changing.";
      } else if (d?.status === "voice_limit_reached") {
        friendly =
          "That ElevenLabs account has no free voice slots left. Delete a voice you no longer use, then try again.";
      } else if (typeof d?.message === "string" && d.message) {
        friendly = d.message;
      }
    } catch {
      /* fall through to a generic message */
    }
    throw new Error(friendly || `Voice cloning failed (${res.status}).`);
  }

  try {
    const id = ((JSON.parse(text) as { voice_id?: string }).voice_id || "").trim();
    if (!id) throw new Error("no id");
    return id;
  } catch {
    throw new Error("Voice cloning returned an unexpected response.");
  }
}
