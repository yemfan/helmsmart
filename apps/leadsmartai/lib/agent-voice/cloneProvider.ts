/**
 * Provider integration point for voice cloning. Implementations return a remote voice id for storage in
 * `agent_voice_settings.voice_clone_remote_id`.
 */

export type CloneProviderId = "elevenlabs";

export type SubmitVoiceCloneResult = {
  remoteVoiceId: string;
  /** Optional preview bytes to store as preview audio in Supabase Storage. */
  previewAudioMp3?: Buffer;
};

export type VoiceCloneProviderAdapter = {
  id: CloneProviderId;
  /** Create a voice from sample audio; throws on HTTP/provider errors. */
  submitFromSample(params: {
    agentId: string;
    filename: string;
    bytes: Buffer;
    mimeType: string;
  }): Promise<SubmitVoiceCloneResult>;
};

const ELEVENLABS_VOICES_URL = "https://api.elevenlabs.io/v1/voices/add";

async function elevenLabsSubmit(params: {
  agentId: string;
  filename: string;
  bytes: Buffer;
  mimeType: string;
}): Promise<SubmitVoiceCloneResult> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  const form = new FormData();
  form.append("name", `CloseBoss-${params.agentId.slice(0, 8)}`);
  form.append("description", "CloseBoss agent voice clone");
  // ElevenLabs sniffs the actual bytes, but keep the multipart filename honest —
  // it accepts both audio (wav/webm/mp3/m4a/ogg/flac) and video (mp4/mov) samples
  // (audio is extracted from video). The intro-video path sends an mp4.
  const lower = params.filename.toLowerCase();
  const mime = params.mimeType.toLowerCase();
  const ext =
    ["wav", "webm", "m4a", "ogg", "flac", "mp4", "mov"].find(
      (e) => lower.endsWith(`.${e}`) || mime.includes(e),
    ) ?? "mp3";
  const blob = new Blob([new Uint8Array(params.bytes)], { type: params.mimeType || "audio/mpeg" });
  form.append("files", blob, `sample.${ext}`);

  const res = await fetch(ELEVENLABS_VOICES_URL, {
    method: "POST",
    headers: {
      "xi-api-key": key,
    },
    body: form,
  });

  const text = await res.text();
  if (!res.ok) {
    // Surface the common account-limit case in plain language instead of raw JSON.
    let friendly = "";
    try {
      const j = JSON.parse(text) as { detail?: { status?: string; code?: string; message?: string } };
      const d = j.detail;
      if (d?.code === "paid_plan_required" || d?.status === "can_not_use_instant_voice_cloning") {
        friendly =
          "Voice cloning needs a paid ElevenLabs plan (Starter or higher). Upgrade your ElevenLabs subscription, then try again — no other change needed.";
      } else if (typeof d?.message === "string" && d.message) {
        friendly = d.message;
      }
    } catch {
      /* fall back to raw text */
    }
    throw new Error(friendly || `ElevenLabs voice create failed (${res.status}): ${text.slice(0, 300)}`);
  }

  let voiceId = "";
  try {
    const json = JSON.parse(text) as { voice_id?: string };
    voiceId = (json.voice_id || "").trim();
  } catch {
    throw new Error("ElevenLabs returned non-JSON response");
  }
  if (!voiceId) {
    throw new Error("ElevenLabs response missing voice_id");
  }

  return { remoteVoiceId: voiceId };
}

export function getVoiceCloneAdapter(provider: CloneProviderId | null | undefined): VoiceCloneProviderAdapter | null {
  if (provider === "elevenlabs") {
    return {
      id: "elevenlabs",
      submitFromSample: elevenLabsSubmit,
    };
  }
  return null;
}
