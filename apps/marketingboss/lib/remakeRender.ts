import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildTalkingAvatar, AVATAR_CREDIT } from "@/lib/avatar";
import { DEFAULT_MODELS, UGC_MAX_SECONDS } from "@/lib/fal";
import { falRun, videoUrlFrom } from "@/lib/falQueue";
import { generateAndStore, UGC_CREDIT, CreditError } from "@/lib/generation";
import type { RecastPlan, RecastShot } from "@/lib/adBlueprint";

/**
 * Render a recast plan into one finished ad.
 *
 * Two renderers, chosen per shot by adBlueprint's routeShot():
 *   avatar -> veed/fabric-1.0, driven by the twin's portrait and a cloned-voice
 *             take of that shot's line. Real lip sync, because the audio drives
 *             the mouth rather than a mouth being invented over fixed audio.
 *   scene  -> Seedance text-to-video. No face reference anywhere near it, which
 *             is what keeps 2.5 (and its 30s ceiling) available — 2.5 refuses a
 *             human-face reference outright, and 2.0's fallback caps at 15s.
 *
 * Then fal's ffmpeg merge concatenates them in order.
 *
 * Shots render SEQUENTIALLY. Running them in parallel would be faster, but the
 * credit reserve happens per shot: a parallel fan-out can pass the balance
 * check five times against the same balance and overdraw it. Sequential also
 * means a mid-run failure has charged only for what actually rendered.
 */

const MERGE_MODEL = "fal-ai/ffmpeg-api/merge-videos";

export type RenderedShot = {
  index: number;
  render: "avatar" | "scene";
  url: string;
  credits: number;
};

export type RemakeRender = {
  /** The finished, concatenated ad. */
  url: string;
  /** Each shot as its own clip, so one bad shot can be re-rolled alone. */
  shots: RenderedShot[];
  /** Credits left after the whole run. */
  credits: number;
  notes: string[];
};

/** What a plan will cost before anything is spent, so the UI can quote it. */
export function quoteRemake(plan: RecastPlan): number {
  return plan.shots.reduce(
    (total, s) => total + (s.render === "avatar" ? AVATAR_CREDIT : UGC_CREDIT),
    0,
  );
}

/** A shot that cannot render is worth catching before any credits are spent. */
function unrenderable(shot: RecastShot): string | null {
  if (shot.render === "avatar" && !shot.line.trim()) {
    return `Shot ${shot.index + 1} shows your face but has no words — give it a line or make it a scene.`;
  }
  if (shot.render === "scene" && !shot.prompt.trim()) {
    return `Shot ${shot.index + 1} has no scene description yet.`;
  }
  return null;
}

export async function renderRemake(
  supabase: SupabaseClient,
  userId: string,
  plan: RecastPlan,
  opts: { characterId: string; voiceId?: string },
): Promise<RemakeRender> {
  if (!plan.shots.length) throw new Error("That plan has no shots in it.");

  // Validate the whole plan first. Failing on shot four after charging for
  // three is the worst outcome here, and every one of these is knowable now.
  const blocked = plan.shots.map(unrenderable).filter((m): m is string => !!m);
  if (blocked.length) throw new Error(blocked.join(" "));

  const shots: RenderedShot[] = [];
  const notes: string[] = [...plan.notes];
  let credits = 0;

  for (const shot of plan.shots) {
    if (shot.render === "avatar") {
      const out = await buildTalkingAvatar(supabase, userId, opts.characterId, shot.line, opts.voiceId ?? "");
      shots.push({ index: shot.index, render: "avatar", url: out.url, credits: AVATAR_CREDIT });
      credits = out.credits;
      continue;
    }

    const out = await generateAndStore(supabase, userId, {
      type: "video",
      prompt: shot.prompt,
      aspect: plan.aspect || "9:16",
      model: DEFAULT_MODELS.ugcText,
      duration: Math.min(Math.max(Math.round(shot.seconds), 4), UGC_MAX_SECONDS),
      resolution: "720p",
    });
    const url = out.urls[0];
    if (!url) throw new Error(`Shot ${shot.index + 1} rendered nothing.`);
    shots.push({ index: shot.index, render: "scene", url, credits: UGC_CREDIT });
    credits = out.credits;
  }

  // A one-shot ad is already the finished thing; merging it would spend a fal
  // call to produce a copy of its own input.
  if (shots.length === 1) return { url: shots[0].url, shots, credits, notes };

  const merged = await falRun(
    MERGE_MODEL,
    { video_urls: shots.map((s) => s.url) },
    { label: "Assembling the ad", timeoutMs: 260_000 },
  );
  const url = videoUrlFrom(merged);
  if (!url) {
    // The shots exist and were paid for — hand them back rather than throwing
    // the whole run away over the last step.
    notes.push("The shots rendered but couldn't be joined into one file. They're listed separately below.");
    return { url: shots[0].url, shots, credits, notes };
  }

  const media = await fetch(url);
  if (!media.ok) throw new Error(`Could not fetch the finished ad (${media.status}).`);
  const bytes = new Uint8Array(await media.arrayBuffer());
  const path = `${userId}/${crypto.randomUUID()}.mp4`;
  const { error: upErr } = await supabase.storage
    .from("media")
    .upload(path, bytes, { contentType: "video/mp4", upsert: false });
  if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);
  const { data: pub } = supabase.storage.from("media").getPublicUrl(path);

  return { url: pub.publicUrl, shots, credits, notes };
}

export { CreditError };
