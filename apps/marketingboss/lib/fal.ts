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
};

export type GenResult = { urls: string[]; model: string };

function headers() {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is not configured on the server.");
  return { Authorization: `Key ${key}`, "Content-Type": "application/json" };
}

function buildRequest(p: GenParams): { model: string; input: Record<string, unknown> } {
  const aspect = p.aspect || "16:9";
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

/** Submit a job, poll to completion, and return the media URL(s). */
export async function generate(p: GenParams): Promise<GenResult> {
  const H = headers();
  const { model, input } = buildRequest(p);

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

  const urls = collectUrls(out);
  if (!urls.length) throw new Error("No media URL in the fal.ai result.");
  return { urls, model };
}
