import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { CALL_LINES } from "@/lib/ai-call/callLineRegistry";

/**
 * Pre-render the fixed receptionist voice-lines in the agent's cloned voice
 * (ElevenLabs) and cache them as public mp3s, so the Twilio webhook can `<Play>`
 * them. Stores a { voiceId, urls } map on agent_voice_settings.voice_lines.
 *
 * Best-effort per line: a line that fails to synth/upload is simply omitted, and
 * the TwiML builder falls back to `<Say>` (Polly) for that line — a call is never
 * broken by a missing clip. Called when the agent turns the cloned voice ON.
 */

const PUBLIC_BUCKET = "social-images";
const ELEVEN_TTS = "https://api.elevenlabs.io/v1/text-to-speech";

export async function generateClonedCallLines(agentId: string, voiceId: string): Promise<number> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key || !voiceId) return 0;

  const urls: Record<string, string> = {};
  for (const line of CALL_LINES) {
    try {
      const res = await fetch(`${ELEVEN_TTS}/${voiceId}`, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({
          text: line.text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.8 },
        }),
      });
      if (!res.ok) continue;
      const bytes = Buffer.from(await res.arrayBuffer());
      const path = `voice-lines/${agentId}/${voiceId}/${line.key}.mp3`;
      const { error } = await supabaseAdmin.storage
        .from(PUBLIC_BUCKET)
        .upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
      if (error) continue;
      urls[line.key] = supabaseAdmin.storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl;
    } catch {
      // skip this line; <Say> covers it
    }
  }

  await supabaseAdmin
    .from("agent_voice_settings")
    .update({ voice_lines: { voiceId, urls }, updated_at: new Date().toISOString() } as never)
    .eq("agent_id", agentId as never);

  return Object.keys(urls).length;
}
