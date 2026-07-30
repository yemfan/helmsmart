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

export type ClipSegment = { from: number; to: number }; // source-video frames
export type ClipPlan = { segments: ClipSegment[]; cues: CaptionCue[]; totalFrames: number };

/**
 * Plan the edit from word timestamps: trim + (optional) silence-cut, and re-time
 * the captions into the resulting COMPRESSED timeline so subtitles stay in sync
 * after gaps are removed.
 *
 * - silenceCut on  → auto-trim leading/trailing dead air (to the first/last word)
 *   AND drop internal gaps longer than SILENCE_SEC, producing multiple source
 *   segments the composition plays back-to-back (jump cuts).
 * - silenceCut off → one segment covering the (optionally trimmed) whole clip.
 *
 * cues are in frames on the compressed timeline; segments are source-video frames.
 */
export function planClip(
  words: ClipWord[],
  opts: {
    videoDurationSec: number;
    fps?: number;
    silenceCut?: boolean;
    trimStartSec?: number;
    trimEndSec?: number;
  },
): ClipPlan {
  const fps = opts.fps ?? CLIP_FPS;
  const dur = Math.max(0.1, opts.videoDurationSec);
  const pad = 0.25;
  const SILENCE_SEC = 0.7;
  const hasWords = words.length > 0;
  const auto = !!opts.silenceCut;

  let rangeStart = opts.trimStartSec ?? (auto && hasWords ? Math.max(0, words[0].start - pad) : 0);
  let rangeEnd = opts.trimEndSec ?? (auto && hasWords ? Math.min(dur, words[words.length - 1].end + pad) : dur);
  rangeStart = Math.max(0, Math.min(rangeStart, dur));
  rangeEnd = Math.max(rangeStart + 0.1, Math.min(rangeEnd, dur));

  const inRange = words.filter((w) => w.end > rangeStart && w.start < rangeEnd);

  let segsSec: { s: number; e: number }[];
  if (opts.silenceCut && inRange.length > 0) {
    segsSec = [];
    let s = Math.max(rangeStart, inRange[0].start - pad);
    let prevEnd = inRange[0].end;
    for (let i = 1; i < inRange.length; i += 1) {
      const w = inRange[i];
      if (w.start - prevEnd > SILENCE_SEC) {
        segsSec.push({ s, e: Math.min(rangeEnd, prevEnd + pad) });
        s = Math.max(rangeStart, w.start - pad);
      }
      prevEnd = w.end;
    }
    segsSec.push({ s, e: Math.min(rangeEnd, prevEnd + pad) });
  } else {
    segsSec = [{ s: rangeStart, e: rangeEnd }];
  }
  segsSec = segsSec.filter((x) => x.e > x.s + 0.05);
  if (segsSec.length === 0) segsSec = [{ s: rangeStart, e: rangeEnd }];

  const segments = segsSec.map((x) => ({ from: Math.round(x.s * fps), to: Math.round(x.e * fps) }));
  const totalFrames = Math.max(1, segments.reduce((n, x) => n + (x.to - x.from), 0));

  // Compressed start (seconds) of each segment.
  const cumBefore: number[] = [];
  let acc = 0;
  for (const x of segsSec) {
    cumBefore.push(acc);
    acc += x.e - x.s;
  }

  // Re-time each word into the compressed timeline, then group into cues.
  const timed: { text: string; cs: number; ce: number }[] = [];
  for (const w of inRange) {
    const idx = segsSec.findIndex((x) => w.start >= x.s - 0.001 && w.start < x.e + 0.001);
    if (idx < 0) continue; // word landed inside a removed gap
    const cs = cumBefore[idx] + (w.start - segsSec[idx].s);
    const ce = cumBefore[idx] + (Math.min(w.end, segsSec[idx].e) - segsSec[idx].s);
    timed.push({ text: w.text, cs, ce });
  }

  const cues: CaptionCue[] = [];
  let cur: typeof timed = [];
  const flush = () => {
    if (cur.length === 0) return;
    const from = Math.round(cur[0].cs * fps);
    const to = Math.max(Math.round(cur[cur.length - 1].ce * fps), from + 1);
    cues.push({ text: cur.map((t) => t.text).join(" "), from, to });
    cur = [];
  };
  for (let i = 0; i < timed.length; i += 1) {
    const t = timed[i];
    const prev = cur[cur.length - 1];
    if (prev && t.cs - prev.ce > 0.5) flush();
    cur.push(t);
    if (cur.length >= 5 || t.ce - (cur[0]?.cs ?? t.cs) >= 1.4) flush();
  }
  flush();

  return { segments, cues, totalFrames };
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
