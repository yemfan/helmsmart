/**
 * Server-side fal.ai generation engine for MarketingBoss AI.
 *
 * Uses fal.ai's queue API (submit -> poll -> fetch result) so the same path
 * serves fast image models and slow video models. The key is read from
 * FAL_KEY (server-only, the platform key) and never reaches the browser.
 */

const IMG_SIZE: Record<string, string> = {
  "16:9": "landscape_16_9",
  "9:16": "portrait_16_9",
  "1:1": "square_hd",
  "4:3": "landscape_4_3",
  "3:4": "portrait_4_3",
};

export const DEFAULT_MODELS = {
  image: "fal-ai/flux/dev",
  // Reference-image editing / composition (Gemini "nano-banana"): use an
  // uploaded image as a base — restyle it, change part of it, or place a
  // person/product into a new scene, all driven by the prompt.
  imageEdit: "fal-ai/nano-banana/edit",
  videoText: "fal-ai/kling-video/v1.6/standard/text-to-video",
  videoImage: "fal-ai/kling-video/v1.6/standard/image-to-video",
  // Kling O1 video-to-video edit: swap a face / product / background inside an
  // existing clip while keeping the original motion, lighting and camera.
  // Reference images map to @Image1..@Image4 in the prompt.
  videoEdit: "fal-ai/kling-video/o1/video-to-video/edit",
  /** Doubles a clip's resolution so it clears the swap model's 720px floor. */
  videoUpscale: "fal-ai/video-upscaler",
  // Seedance 2.5 — realistic people + native lip-synced audio; used for UGC ads
  // (a creator talking to camera). Reference-to-video accepts uploaded
  // images/videos so we can emulate a viral ad the user drops in.
  //
  // 2.5 over 2.0 for one reason: it generates up to 30s in a SINGLE shot, where
  // 2.0 capped at 15s. A normal UGC ad is 15-30s, so 2.0 could not reach ad
  // length without generating two clips and merging them — and a merge seam in
  // the middle of a talking-head ad is exactly where it looks fake.
  ugcText: "bytedance/seedance-2.5/text-to-video",
  ugcRef: "bytedance/seedance-2.5/reference-to-video",
};

export type GenType = "image" | "video";

export type GenParams = {
  type: GenType;
  prompt: string;
  aspect?: string;
  model?: string;
  num?: number;
  duration?: number;
  imageUrl?: string;
  /** Seedance reference inputs (2.5: up to 30 images / 10 videos, ≤50 total). */
  imageUrls?: string[];
  videoUrls?: string[];
  /** Output height for Seedance: "480p" | "720p" | "1080p". */
  resolution?: string;
  /** Source clip for a video-to-video edit / swap (Kling O1). */
  videoUrl?: string;
  /** Keep the source clip's original audio through the edit. */
  keepAudio?: boolean;
};

/** Seedance models are ByteDance-hosted on fal and take a different input shape. */
function isSeedance(model?: string): boolean {
  return !!model && model.startsWith("bytedance/seedance");
}

export type GenResult = { urls: string[]; model: string };

function headers() {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is not configured on the server.");
  return { Authorization: `Key ${key}`, "Content-Type": "application/json" };
}

function buildRequest(p: GenParams): { model: string; input: Record<string, unknown> } {
  const aspect = p.aspect || "16:9";

  // Video-to-video edit / swap: a source clip + reference image(s) -> Kling O1
  // replaces the named face / product / background while preserving the original
  // motion, lighting and camera. Reference images map to @Image1..@Image4.
  if (p.videoUrl) {
    const model = p.model || DEFAULT_MODELS.videoEdit;
    const input: Record<string, unknown> = {
      prompt: p.prompt,
      video_url: p.videoUrl,
      keep_audio: p.keepAudio ?? true,
    };
    if (p.imageUrls?.length) input.image_urls = p.imageUrls.slice(0, 4);
    return { model, input };
  }

  // Seedance (UGC): realistic talking-creator video with native audio. Uploaded
  // image/video references route to reference-to-video (emulate a viral ad).
  if (isSeedance(p.model)) {
    const hasRefs = !!(p.imageUrls?.length || p.videoUrls?.length);
    const model = hasRefs ? DEFAULT_MODELS.ugcRef : p.model!;
    const input: Record<string, unknown> = {
      prompt: p.prompt,
      aspect_ratio: aspect,
      resolution: p.resolution || "720p",
      duration: p.duration ? String(p.duration) : "auto",
      generate_audio: true,
    };
    if (p.imageUrls?.length) input.image_urls = p.imageUrls.slice(0, 30);
    if (p.videoUrls?.length) input.video_urls = p.videoUrls.slice(0, 10);
    return { model, input };
  }

  if (p.type === "video") {
    const model = p.model || (p.imageUrl ? DEFAULT_MODELS.videoImage : DEFAULT_MODELS.videoText);
    const input: Record<string, unknown> = {
      prompt: p.prompt,
      duration: String(p.duration || 5),
      aspect_ratio: aspect,
    };
    if (p.imageUrl) input.image_url = p.imageUrl;
    return { model, input };
  }
  // Image + a reference upload -> edit / compose from that image.
  if (p.imageUrl) {
    const model = p.model || DEFAULT_MODELS.imageEdit;
    return {
      model,
      input: {
        prompt: p.prompt,
        image_urls: [p.imageUrl],
        num_images: Math.min(Math.max(p.num || 1, 1), 4),
      },
    };
  }
  // Plain text-to-image.
  const model = p.model || DEFAULT_MODELS.image;
  return {
    model,
    input: {
      prompt: p.prompt,
      image_size: IMG_SIZE[aspect] || "landscape_16_9",
      num_images: Math.min(Math.max(p.num || 1, 1), 4),
      enable_safety_checker: true,
    },
  };
}

function collectUrls(result: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const push = (u: unknown) => {
    if (typeof u === "string" && u) urls.push(u);
  };
  const images = result.images;
  if (Array.isArray(images)) images.forEach((im) => push((im as { url?: unknown })?.url));
  push((result.image as { url?: unknown })?.url);
  push((result.video as { url?: unknown })?.url);
  return urls;
}

/** Submit a job to `model`, poll to completion, and return the raw result. */
async function runModel(model: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const H = headers();

  const sub = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(input),
  });
  const q = (await sub.json().catch(() => ({}))) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
    detail?: string;
  };
  if (!sub.ok) throw new Error(`fal submit ${sub.status}: ${q.detail || JSON.stringify(q)}`);

  const statusUrl = q.status_url || `https://queue.fal.run/${model}/requests/${q.request_id}/status`;
  const responseUrl = q.response_url || `https://queue.fal.run/${model}/requests/${q.request_id}`;

  const started = Date.now();
  const TIMEOUT_MS = 280_000; // stay under the 300s function ceiling
  for (;;) {
    const r = await fetch(statusUrl, { headers: H });
    const s = (await r.json().catch(() => ({}))) as { status?: string };
    if (s.status === "COMPLETED") break;
    if (s.status === "FAILED" || s.status === "ERROR")
      throw new Error(`fal generation failed: ${JSON.stringify(s)}`);
    if (Date.now() - started > TIMEOUT_MS)
      throw new Error("Generation timed out. Video can take a couple minutes — try again.");
    await new Promise((res) => setTimeout(res, 2500));
  }

  const rr = await fetch(responseUrl, { headers: H });
  const out = (await rr.json().catch(() => ({}))) as Record<string, unknown>;
  if (!rr.ok) throw new Error(`fal result ${rr.status}: ${JSON.stringify(out)}`);
  return out;
}

/** Submit a job, poll to completion, and return the media URL(s). */
export async function generate(p: GenParams): Promise<GenResult> {
  const { model, input } = buildRequest(p);
  const out = await runModel(model, input);
  const urls = collectUrls(out);
  if (!urls.length) throw new Error("No media URL in the fal.ai result.");
  return { urls, model };
}

/**
 * Raise a clip above a model's resolution floor. Deliberately its OWN request
 * rather than a step chained ahead of the swap: an upscale and a Kling O1 edit
 * are each minutes long, and running them back to back inside one 300s function
 * is how the CloseBoss avatar renders used to 504 — losing the reserved credits
 * with them, because SIGKILL skips the refund. Two short calls always beat one
 * long one here.
 */
export async function upscaleVideo(videoUrl: string): Promise<string> {
  const out = await runModel(DEFAULT_MODELS.videoUpscale, { video_url: videoUrl, scale: 2 });
  const url = collectUrls(out)[0];
  if (!url) throw new Error("No media URL in the fal.ai result.");
  return url;
}
