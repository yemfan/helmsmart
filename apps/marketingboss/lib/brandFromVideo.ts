import "server-only";
import { anthropicJson } from "@/lib/ai";

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

const QUEUE = "https://queue.fal.run";
const WIZPER = "fal-ai/wizper";

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

function falHeaders(): Record<string, string> {
  const key = process.env.FAL_KEY?.trim();
  if (!key) throw new Error("FAL_KEY is not configured on the server.");
  return { Authorization: `Key ${key}`, "Content-Type": "application/json" };
}

/** Transcribe the clip. Wizper's `audio_url` accepts an mp4 and pulls the audio. */
async function transcribe(mediaUrl: string): Promise<string> {
  const H = falHeaders();
  const sub = await fetch(`${QUEUE}/${WIZPER}`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ audio_url: mediaUrl, task: "transcribe" }),
  });
  const q = (await sub.json().catch(() => ({}))) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
  };
  if (!sub.ok) throw new Error(`Transcription rejected (${sub.status}).`);

  const statusUrl = q.status_url || `${QUEUE}/${WIZPER}/requests/${q.request_id}/status`;
  const responseUrl = q.response_url || `${QUEUE}/${WIZPER}/requests/${q.request_id}`;
  const started = Date.now();
  for (;;) {
    const s = (await (await fetch(statusUrl, { headers: H })).json().catch(() => ({}))) as {
      status?: string;
    };
    if (s.status === "COMPLETED") break;
    if (s.status === "FAILED" || s.status === "ERROR") throw new Error("Transcription failed.");
    if (Date.now() - started > 180_000) throw new Error("Transcription timed out.");
    await new Promise((r) => setTimeout(r, 2500));
  }
  const out = (await (await fetch(responseUrl, { headers: H })).json().catch(() => ({}))) as {
    text?: string;
    detail?: unknown;
  };
  if (out.detail) throw new Error("That file couldn't be transcribed.");
  return (out.text ?? "").trim();
}

/**
 * Transcribe `mediaUrl` and derive Brand Kit fields from what was said.
 *
 * Throws when there is too little speech to work from, rather than inventing a
 * brand voice out of silence — a confident guess from nothing is worse than
 * saying the video had no words in it.
 */
export async function brandFromVideo(mediaUrl: string): Promise<BrandFromVideo> {
  const transcript = await transcribe(mediaUrl);
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
