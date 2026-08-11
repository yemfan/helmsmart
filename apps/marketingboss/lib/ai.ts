import "server-only";

/**
 * MarketingBoss AI — the copywriter behind the AI Social Post composer.
 *
 * Calls Claude (Anthropic Messages API) over raw fetch — same dependency-free
 * style as every other integration here (fal / meta / threads / linkedin). Two
 * jobs:
 *   1. draftPost()        — turn a plain intent into a title, caption, CTA,
 *                           hashtags, and (if the user wants media) an image or
 *                           video generation prompt for fal.ai.
 *   2. adaptForPlatforms()— rewrite one caption into the best version for each
 *                           selected network (length, tone, link handling).
 *
 * The key lives in ANTHROPIC_API_KEY (server-only) and never reaches the browser.
 * Structured outputs (output_config.format) guarantee valid JSON back.
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-5";

export type PostType = "text" | "image" | "video";

export type Draft = {
  title: string;
  caption: string;
  cta: string;
  hashtags: string[];
  /** fal.ai prompt when the user chose an image (empty otherwise). */
  imagePrompt: string;
  /** fal.ai prompt when the user chose a video (empty otherwise). */
  videoPrompt: string;
};

export type PlatformCaption = { platform: string; caption: string };

export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export const ANTHROPIC_API_URL = API_URL;
export const ANTHROPIC_MODEL = MODEL;

/** Call Claude and parse the JSON its structured-output format guarantees. */
export async function anthropicJson<T>(opts: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured on the server.");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 3000,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
      // Snappy, cost-effective copywriting; low effort is strong on Opus 5.
      output_config: { effort: "low", format: { type: "json_schema", schema: opts.schema } },
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    content?: { type: string; text?: string }[];
    stop_reason?: string;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(data.error?.message || `AI request failed (${res.status}).`);
  if (data.stop_reason === "refusal") throw new Error("The AI declined this request. Try rephrasing your topic.");
  if (data.stop_reason === "max_tokens") throw new Error("The AI response was cut off before it finished — please try again.");

  const text = data.content?.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("The AI returned an empty response.");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Could not read the AI response.");
  }
}

const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    caption: { type: "string" },
    cta: { type: "string" },
    hashtags: { type: "array", items: { type: "string" } },
    imagePrompt: { type: "string" },
    videoPrompt: { type: "string" },
  },
  required: ["title", "caption", "cta", "hashtags", "imagePrompt", "videoPrompt"],
  additionalProperties: false,
};

/**
 * Turn a plain-language intent into a ready-to-post draft. When `type` is
 * "image" or "video" it also writes a strong fal.ai generation prompt the user
 * reviews before rendering; the unused prompt field comes back empty.
 */
export async function draftPost(intent: string, type: PostType, brand?: string): Promise<Draft> {
  const wantsImage = type === "image";
  const wantsVideo = type === "video";

  const system = [
    "You are a senior social-media marketer writing scroll-stopping posts for a small business.",
    "Write in a warm, confident, human voice — specific and benefit-led, never generic or salesy.",
    "Return ALL fields:",
    "- title: a short punchy headline (also used as a video title). Under ~70 characters.",
    "- caption: the main post copy, 1–3 short paragraphs, ready to publish. Do NOT include hashtags in the caption.",
    "- cta: one clear call to action (e.g. 'Book a free consult', 'Visit AVASC.org').",
    "- hashtags: 4–8 relevant hashtags WITHOUT the # sign.",
    wantsImage
      ? "- imagePrompt: a vivid, detailed prompt for an AI image generator that would make a strong visual for this post (subject, style, lighting, composition, mood). Design it to work WITHOUT any rendered text — image models garble lettering and the caption carries the words; only when a short overlay is truly essential, give the exact wording (3 words max) in double quotes. Leave videoPrompt as an empty string."
      : wantsVideo
        ? "- videoPrompt: a vivid, detailed prompt for an AI video generator (subject, motion, camera move, mood, ~5s clip). No on-screen text, captions, or subtitles. Leave imagePrompt as an empty string."
        : "- Leave both imagePrompt and videoPrompt as empty strings (this is a text-only post).",
    // Brand Kit — fold the user's brand memory in so copy + media prompts stay
    // on-brand. Empty string when no kit is set, leaving the prompt unchanged.
    brand?.trim() ? `\n${brand.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const user = `Write a ${type} social media post about:\n\n${intent}`;

  return anthropicJson<Draft>({ system, user, schema: DRAFT_SCHEMA });
}

export type UgcAd = {
  /** The scroll-stopping first line the creator says. */
  hook: string;
  /** The full spoken script (hook → why → product → CTA), conversational. */
  script: string;
  /** On-screen caption lines to overlay (kept for future burn-in). */
  onScreen: string[];
  cta: string;
  hashtags: string[];
  /** A Seedance-ready prompt: the creator, scene, and the lines they speak. */
  videoPrompt: string;
};

const UGC_SCHEMA = {
  type: "object",
  properties: {
    hook: { type: "string" },
    script: { type: "string" },
    onScreen: { type: "array", items: { type: "string" } },
    cta: { type: "string" },
    hashtags: { type: "array", items: { type: "string" } },
    videoPrompt: { type: "string" },
  },
  required: ["hook", "script", "onScreen", "cta", "hashtags", "videoPrompt"],
  additionalProperties: false,
};

/**
 * Write a short-form UGC ad: an authentic creator-to-camera script plus a
 * Seedance-ready video prompt that renders that creator speaking it (Seedance
 * generates the person + native audio, so the prompt embeds the actual lines).
 */
export async function draftUgcAd(intent: string, hasReference: boolean, styleHint?: string): Promise<UgcAd> {
  const system = [
    "You are a top-performing UGC (user-generated content) ad creator for short-form video (TikTok/Reels/Shorts).",
    "Write a single ~10-15 second ad as if a real person filmed it on their phone — casual, authentic, NOT polished or corporate.",
    "Structure: a scroll-stopping hook in the first 2 seconds, a quick relatable why/problem, the product as the fix, and a clear CTA.",
    "Return:",
    "- hook: the exact opening line the creator says.",
    "- script: the full spoken script, first person, conversational, ~30-45 words.",
    "- onScreen: 2-4 short on-screen caption lines (punchy fragments).",
    "- cta: one clear call to action.",
    "- hashtags: 4-8 relevant tags WITHOUT the # sign.",
    "- videoPrompt: a vivid prompt for an AI video model that will GENERATE the creator and their VOICE. Describe the person (age/vibe), the real-world setting, that they speak directly to a handheld phone camera in a casual excited tone, and embed the spoken lines in quotes. Specify vertical 9:16, natural lighting, authentic selfie-style UGC — not cinematic or ad-like.",
    hasReference
      ? "A reference image/video was provided — in videoPrompt, match its style, energy, framing, and pacing (you may refer to it as @Video1 / @Image1)."
      : "",
    styleHint
      ? `Emulate this trending ad format the user chose — borrow its hook style, pacing, and structure (do NOT copy its exact words):\n${styleHint}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return anthropicJson<UgcAd>({
    system,
    user: `Create a UGC ad about:\n\n${intent}`,
    schema: UGC_SCHEMA,
    maxTokens: 1500,
  });
}

const ADAPT_SCHEMA = {
  type: "object",
  properties: {
    posts: {
      type: "array",
      items: {
        type: "object",
        properties: { platform: { type: "string" }, caption: { type: "string" } },
        required: ["platform", "caption"],
        additionalProperties: false,
      },
    },
  },
  required: ["posts"],
  additionalProperties: false,
};

/** Per-network guidance so each caption is native to its platform. */
const PLATFORM_GUIDE: Record<string, string> = {
  facebook: "Facebook: friendly and conversational; a link in the text is clickable, so include the CTA link inline if given.",
  instagram: "Instagram: punchy hook first line, then value, then hashtags at the end; links aren't clickable, so say 'link in bio' instead of pasting a URL.",
  threads: "Threads: concise and casual, under 500 characters, 1–3 hashtags max, no pasted links (mention the destination by name).",
  linkedin: "LinkedIn: professional and insight-led; a short thoughtful take; include the CTA link inline if given; 0–3 hashtags.",
  pinterest: "Pinterest: keyword-rich, SEO-minded description of the visual and the offer; the CTA link is attached separately, so don't paste it.",
  youtube: "YouTube: a clear video description — what the viewer gets, plus the CTA link inline if given.",
};

/**
 * Rewrite one draft into the best caption for each selected platform. `link` is
 * the optional CTA destination (e.g. https://avasc.org). Returns one caption per
 * requested platform, in the same order.
 */
export async function adaptForPlatforms(
  draft: Draft,
  link: string | null,
  platforms: string[],
): Promise<PlatformCaption[]> {
  if (platforms.length === 0) return [];

  const system = [
    "You are a social-media manager tailoring ONE post to several networks.",
    "Keep the core message and voice, but rewrite each caption to be native to its platform:",
    ...platforms.map((p) => `- ${PLATFORM_GUIDE[p] ?? p}`),
    "Weave in the call to action naturally. Only paste the link on platforms where links are clickable and a link is provided.",
    "Return exactly one entry per requested platform, using these platform keys: " + platforms.join(", ") + ".",
  ].join("\n");

  const user = [
    `Title: ${draft.title}`,
    `Caption: ${draft.caption}`,
    `Call to action: ${draft.cta}`,
    link ? `Link: ${link}` : "Link: (none)",
    draft.hashtags.length ? `Suggested hashtags: ${draft.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}` : "",
    "",
    `Tailor this post for: ${platforms.join(", ")}.`,
  ]
    .filter(Boolean)
    .join("\n");

  const out = await anthropicJson<{ posts: PlatformCaption[] }>({ system, user, schema: ADAPT_SCHEMA });
  // Return in the requested order, falling back to the base caption if the model skipped one.
  return platforms.map((p) => {
    const hit = out.posts.find((x) => x.platform === p);
    return { platform: p, caption: hit?.caption ?? draft.caption };
  });
}
