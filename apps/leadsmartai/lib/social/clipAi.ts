import "server-only";

import OpenAI, { toFile } from "openai";

import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import { getOpenAIConfig } from "@/lib/ai/openaiClient";

/**
 * The "AI editing" layer for the branded-clip video editor. One transcript
 * (OpenAI Whisper, word-level timestamps) unlocks both:
 *   - captionCues() → burned-in subtitles
 *   - generateClipCopy() → Claude writes the hook/caption/CTA from what's said
 *
 * Everything fails soft (returns null / falls back) so a missing key or a big
 * file never blocks the brand-wrap render — you just don't get that layer.
 */

const WHISPER_MAX_BYTES = 25 * 1024 * 1024; // OpenAI transcription hard limit
const CLIP_FPS = 30;

export type ClipWord = { text: string; start: number; end: number };
export type CaptionCue = { text: string; from: number; to: number }; // frames

export type Transcript = { text: string; words: ClipWord[] };

/** Transcribe the uploaded clip. Returns null on no key / >25MB / any error. */
export async function transcribeClip(videoUrl: string): Promise<Transcript | null> {
  const { apiKey } = getOpenAIConfig();
  if (!apiKey) return null;
  try {
    const res = await fetch(videoUrl);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > WHISPER_MAX_BYTES) return null; // too big to transcribe

    const client = new OpenAI({ apiKey });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tr: any = await client.audio.transcriptions.create({
      file: await toFile(buf, "clip.mp4", { type: "video/mp4" }),
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    });
    const words: ClipWord[] = Array.isArray(tr?.words)
      ? tr.words
          .map((w: { word?: string; start?: number; end?: number }) => ({
            text: String(w.word ?? "").trim(),
            start: Number(w.start ?? 0),
            end: Number(w.end ?? 0),
          }))
          .filter((w: ClipWord) => w.text)
      : [];
    return { text: String(tr?.text ?? ""), words };
  } catch (e) {
    console.warn("[clipAi] transcribe failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Group words into short on-screen caption cues (~1.4s or ~5 words, whichever
 * comes first; also breaks on a big gap). Times are in FRAMES relative to the
 * clip start — which is what BrandedClip's video sequence uses.
 */
export function captionCues(words: ClipWord[], fps = CLIP_FPS): CaptionCue[] {
  const cues: CaptionCue[] = [];
  let cur: ClipWord[] = [];
  const flush = () => {
    if (cur.length === 0) return;
    const from = Math.round(cur[0].start * fps);
    const to = Math.round(cur[cur.length - 1].end * fps);
    cues.push({ text: cur.map((w) => w.text).join(" "), from, to: Math.max(to, from + 1) });
    cur = [];
  };
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    const prev = cur[cur.length - 1];
    const bigGap = prev && w.start - prev.end > 0.6;
    if (bigGap) flush();
    cur.push(w);
    const spanSec = w.end - (cur[0]?.start ?? w.start);
    if (cur.length >= 5 || spanSec >= 1.4) flush();
  }
  flush();
  return cues;
}

/** Claude writes a claim-safe hook / caption / CTA from the transcript. */
export async function generateClipCopy(
  transcript: string,
): Promise<{ hook: string; caption: string; cta: string } | null> {
  const text = transcript.trim();
  if (!text || !isAnthropicConfigured()) return null;
  try {
    const client = getAnthropicClient();
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system:
        "You write social copy for a real-estate agent's short video, for the CloseBoss brand (an AI team for realtors). From the transcript, return ONLY JSON {\"hook\":\"…\",\"caption\":\"…\",\"cta\":\"…\"}. hook: a punchy on-screen intro line, ≤ 7 words. caption: the post text, 1-2 sentences, no URL. cta: an action, ≤ 4 words. Do NOT invent stats, guarantees, prices, or competitor names. If the transcript is empty or unusable, still return a generic real-estate hook/caption/cta.",
      messages: [{ role: "user", content: `Transcript:\n---\n${text.slice(0, 6000)}\n---\nReturn only the JSON.` }],
    });
    const block = res.content.find((b) => b.type === "text");
    const raw = block && block.type === "text" ? block.text : "";
    const slice = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const j = JSON.parse(slice) as { hook?: string; caption?: string; cta?: string };
    const hook = (j.hook ?? "").trim();
    const caption = (j.caption ?? "").trim();
    const cta = (j.cta ?? "").trim();
    if (!hook && !caption) return null;
    return { hook: hook || "Watch this", caption: caption || hook, cta: cta || "See how it works" };
  } catch (e) {
    console.warn("[clipAi] generateClipCopy failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
