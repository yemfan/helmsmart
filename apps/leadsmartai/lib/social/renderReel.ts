import "server-only";

import { renderMediaOnLambda, getRenderProgress } from "@remotion/lambda/client";
import type { AwsRegion } from "@remotion/lambda/client";

/**
 * Reel render pipeline — triggers a Remotion Lambda render of the "CarouselReel"
 * composition (1080×1920 vertical video) and polls it to completion. A Vercel
 * function can't encode video, so this offloads to the deployed Lambda; the
 * resulting MP4 (public S3 URL) is what the reel publishers post.
 *
 * Config comes from env (set in Vercel): REMOTION_AWS_REGION,
 * REMOTION_FUNCTION_NAME, REMOTION_SERVE_URL, plus the AWS credentials
 * (REMOTION_AWS_ACCESS_KEY_ID / REMOTION_AWS_SECRET_ACCESS_KEY, auto-read by the
 * Remotion client). reelConfigured() is false until those are present, so
 * callers can degrade gracefully instead of throwing.
 */

export type ReelSlide = { heading: string; body: string };

const REGION = process.env.REMOTION_AWS_REGION as AwsRegion | undefined;
const FUNCTION_NAME = process.env.REMOTION_FUNCTION_NAME;
const SERVE_URL = process.env.REMOTION_SERVE_URL;
const COMPOSITION = "CarouselReel";

/** True when the Lambda render env is fully configured. */
export function reelConfigured(): boolean {
  return Boolean(
    REGION &&
      FUNCTION_NAME &&
      SERVE_URL &&
      (process.env.REMOTION_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID) &&
      (process.env.REMOTION_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY),
  );
}

/**
 * Kick off a render. Returns { renderId, bucketName } to poll with, or null when
 * the render env isn't configured. Output is written PUBLIC so the social
 * platforms (and the preview) can fetch the MP4 by URL.
 */
export async function triggerReelRender(
  slides: ReelSlide[],
): Promise<{ renderId: string; bucketName: string } | null> {
  if (!reelConfigured()) return null;
  const clean = slides.filter((s) => s && (s.heading || s.body));
  if (clean.length === 0) return null;

  const { renderId, bucketName } = await renderMediaOnLambda({
    region: REGION!,
    functionName: FUNCTION_NAME!,
    serveUrl: SERVE_URL!,
    composition: COMPOSITION,
    inputProps: { slides: clean },
    codec: "h264",
    privacy: "public",
    downloadBehavior: { type: "play-in-browser" },
    maxRetries: 1,
    // One slide (120 frames) per lambda → ~5 concurrent invocations for a
    // 5-slide reel, well under a fresh account's low Lambda concurrency quota
    // (the default ~30-chunk split trips "Rate Exceeded" on new accounts).
    framesPerLambda: 120,
  });
  return { renderId, bucketName };
}

/**
 * Kick off a BrandedClip render — wraps an agent's UPLOADED video (public URL,
 * reachable during the render) into a branded vertical reel. Same Lambda config
 * as the slide reels, different composition. Poll with getReelRenderStatus.
 */
export async function triggerBrandedClipRender(input: {
  videoUrl: string;
  videoDurationInFrames: number;
  hook: string;
  cta: string;
  /** Optional burned-in caption cues, in frames relative to the clip start. */
  captions?: { text: string; from: number; to: number }[];
}): Promise<{ renderId: string; bucketName: string } | null> {
  if (!reelConfigured()) return null;
  if (!input.videoUrl) return null;

  const { renderId, bucketName } = await renderMediaOnLambda({
    region: REGION!,
    functionName: FUNCTION_NAME!,
    serveUrl: SERVE_URL!,
    composition: "BrandedClip",
    inputProps: {
      videoUrl: input.videoUrl,
      videoDurationInFrames: Math.max(1, Math.round(input.videoDurationInFrames || 150)),
      hook: input.hook || "Watch this →",
      cta: input.cta || "See how it works",
      captions: Array.isArray(input.captions) ? input.captions : [],
    },
    codec: "h264",
    privacy: "public",
    downloadBehavior: { type: "play-in-browser" },
    maxRetries: 1,
    framesPerLambda: 120,
  });
  return { renderId, bucketName };
}

export type ReelRenderStatus =
  | { done: false; progress: number }
  | { done: true; url: string; progress: 1 }
  | { done: true; error: string; progress: number };

/** Poll a render. When done, `url` is the public MP4; on failure, `error`. */
export async function getReelRenderStatus(
  renderId: string,
  bucketName: string,
): Promise<ReelRenderStatus> {
  const p = await getRenderProgress({
    renderId,
    bucketName,
    functionName: FUNCTION_NAME!,
    region: REGION!,
  });
  if (p.fatalErrorEncountered) {
    return { done: true, error: p.errors?.[0]?.message ?? "Render failed.", progress: p.overallProgress ?? 0 };
  }
  if (p.done && p.outputFile) {
    return { done: true, url: p.outputFile, progress: 1 };
  }
  return { done: false, progress: p.overallProgress ?? 0 };
}
