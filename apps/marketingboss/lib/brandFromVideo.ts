import "server-only";
import { anthropicJson } from "@/lib/ai";
import { transcribeMedia } from "@/lib/transcribeMedia";

/**
 * Read a brand's voice off a video of someone talking — the last piece of the
 * digital twin, after the cloned voice and the talking avatar.
 *
 * Someone who already speaks to camera has stated their positioning out loud;
 * asking them to retype it as "tone of voice" and "audience" is asking twice.
 * This transcribes what they said and turns it into the Brand Kit fields.
 *
 * Suggestions only. The result is handed back for review rather than written
 * over an existing Brand Kit — a transcript of one video is evidence about a
 * brand, not authority over it.
 *
 * Verified against fal on 2026-08-20: Wizper transcribed a 30s MP4 in 3s,
 * returning 401 characters of accurate speech.
 */

export type BrandFromVideo = {
  /** The business name if it is actually said; empty when it is not. */
  brandName: string;
  /** How they speak — the Brand Kit's `voice` field. */
  voice: string;
  /** Who they are speaking to. */
  audience: string;
  /** What was heard, so the user can judge the suggestion against it. */
  transcript: string;
};

const SCHEMA = {
  type: "object",
  properties: {
    brandName: { type: "string" },
    voice: { type: "string" },
    audience: { type: "string" },
  },
  required: ["brandName", "voice", "audience"],
  additionalProperties: false,
};

/**
 * Transcribe `mediaUrl` and derive Brand Kit fields from what was said.
 *
 * Throws when there is too little speech to work from, rather than inventing a
 * brand voice out of silence — a confident guess from nothing is worse than
 * saying the video had no words in it.
 */
export async function brandFromVideo(mediaUrl: string): Promise<BrandFromVideo> {
  const transcript = await transcribeMedia(mediaUrl);
  if (transcript.length < 80) {
    throw new Error(
      "There wasn't enough speech in that video to read a brand voice from. Try a clip where you talk for 20 seconds or more.",
    );
  }

  const system = [
    "You infer a brand's positioning from how its owner actually speaks.",
    "You are given a transcript of one short video. Return:",
    "- brandName: the business name ONLY if it is actually said. If it is not, return an empty string — do not invent one.",
    "- voice: how this person speaks, as a tone-of-voice note another writer could follow. Describe the register, pacing and attitude you can hear in the words. 25-45 words.",
    "- audience: who they are plainly talking to, in one short phrase.",
    "Base every answer on the transcript. Where it does not say, prefer an empty string over a plausible guess.",
  ].join("\n");

  const out = await anthropicJson<Omit<BrandFromVideo, "transcript">>({
    system,
    user: `Transcript:\n\n${transcript.slice(0, 6000)}`,
    schema: SCHEMA,
    maxTokens: 700,
  });

  return { ...out, transcript };
}
