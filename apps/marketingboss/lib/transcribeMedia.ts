import "server-only";

/**
 * Speech-to-text for an uploaded clip, via fal's Wizper (Whisper) endpoint.
 *
 * Extracted from lib/brandFromVideo.ts when the ad blueprint analyzer needed
 * the same step: both read a reference video, and a second copy of the queue
 * poll would have been a second place for the timeout and the COMPLETED-but-
 * rejected case to drift.
 *
 * Verified against fal on 2026-08-20: a 30s MP4 transcribed in 3s, returning
 * 401 characters of accurate speech.
 */

const QUEUE = "https://queue.fal.run";
const WIZPER = "fal-ai/wizper";

function falHeaders(): Record<string, string> {
  const key = process.env.FAL_KEY?.trim();
  if (!key) throw new Error("FAL_KEY is not configured on the server.");
  return { Authorization: `Key ${key}`, "Content-Type": "application/json" };
}

/** Transcribe the clip. Wizper's `audio_url` accepts an mp4 and pulls the audio. */
export async function transcribeMedia(mediaUrl: string): Promise<string> {
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
  // A COMPLETED job can still carry a validation error instead of a result.
  if (out.detail) throw new Error("That file couldn't be transcribed.");
  return (out.text ?? "").trim();
}
