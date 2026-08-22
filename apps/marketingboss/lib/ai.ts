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

/** Every caption opens with a scroll-stopper — one rule shared by all post generators. */
export const HOOK_RULE =
  'The caption MUST open with a HOOK on its own first line: 12 words or fewer that stop the target reader mid-scroll — a surprising number, a bold claim, a sharp question, or real stakes. Never open with the brand name, "We…", or a label like "Tip of the week:". Blank line after the hook, then the body.';

/** The marketing-craft checklist folded into every caption-writing prompt. */
export const CRAFT_RULES = [
  "Craft rules — apply ALL of these to the caption:",
  "• ONE idea per post. Cut anything serving a second idea.",
  "• Specificity beats adjectives: use real numbers, names, timeframes, and receipts FROM THE MATERIAL PROVIDED — never invent them.",
  "• Pick ONE emotional driver that fits (curiosity, loss-aversion, aspiration, belonging) and commit the whole post to it.",
  "• Use evidence when the material provides it — a stat, a quote, a source name. Attribution builds trust.",
  "• Write for skimmers: short lines, line breaks between thoughts, a numbered/bulleted list when there are 3+ items.",
  "• End with exactly ONE low-friction call to action tied to the value just delivered — not three asks.",
].join("\n");

/** Media prompts sell the post's ONE idea, not a generic scene. */
export const MEDIA_CRAFT =
  "The visual must dramatize the post's ONE idea with a single strong subject, bold composition, and feed-stopping contrast — a pattern interrupt, never a generic stock scene.";

export const ANTHROPIC_API_URL = API_URL;
export const ANTHROPIC_MODEL = MODEL;

/** A still for the model to look at — a fetchable URL, or inline bytes. */
export type PromptImage = {
  /** Text placed immediately before the image, e.g. a timestamp. */
  label?: string;
  url?: string;
  base64?: string;
  /** Required alongside `base64`, e.g. "image/png". */
  mediaType?: string;
};

/** Call Claude and parse the JSON its structured-output format guarantees. */
export async function anthropicJson<T>(opts: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  /**
   * Stills for the model to look at, sent ahead of `user`.
   *
   * Each `label` becomes a text block immediately before its image, which is
   * what lets the model say "at 8.5s the shot changes" rather than describing
   * an unordered pile of pictures — the ad blueprint analyzer depends on it.
   * Omit entirely and the request is byte-identical to the text-only form.
   *
   * Give each image either a `url` the API can fetch, or `base64` + its
   * `mediaType`. Frames pulled straight out of a video are already bytes in
   * hand, so inlining them skips an upload the caller would otherwise only do
   * to have the API download it again.
   */
  images?: PromptImage[];
  /**
   * Reasoning effort. Copywriting is fine on "low"; reading a shot list off
   * frames is not, so callers doing analysis should raise it. Opus 5 accepts
   * all five levels.
   */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}): Promise<T> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured on the server.");

  // A plain string when there are no images, so the existing text-only callers
  // send exactly the request they always did.
  const content = opts.images?.length
    ? [
        ...opts.images.flatMap((img) => {
          const source = img.base64
            ? { type: "base64", media_type: img.mediaType || "image/png", data: img.base64 }
            : img.url
              ? { type: "url", url: img.url }
              : null;
          if (!source) throw new Error("Each image needs either a url or base64 data.");
          return [
            ...(img.label ? [{ type: "text", text: img.label }] : []),
            { type: "image", source },
          ];
        }),
        { type: "text", text: opts.user },
      ]
    : opts.user;

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
      messages: [{ role: "user", content }],
      // Snappy, cost-effective copywriting; low effort is strong on Opus 5.
      output_config: {
        effort: opts.effort ?? "low",
        format: { type: "json_schema", schema: opts.schema },
      },
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
    CRAFT_RULES,
    "Return ALL fields:",
    "- title: a short punchy headline (also used as a video title). Under ~70 characters.",
    "- caption: the main post copy, 1–3 short paragraphs, ready to publish. Do NOT include hashtags in the caption. " + HOOK_RULE,
    "- cta: one clear call to action (e.g. 'Book a free consult', 'Visit AVASC.org'). Do NOT also write the CTA inside the caption — it is appended from this field, so repeating it publishes it twice.",
    "- hashtags: 4–8 relevant hashtags WITHOUT the # sign.",
    wantsImage
      ? "- imagePrompt: a vivid, detailed prompt for an AI image generator that would make a strong visual for this post (subject, style, lighting, composition, mood). " +
        MEDIA_CRAFT +
        " Design it to work WITHOUT any rendered text — image models garble lettering and the caption carries the words; only when a short overlay is truly essential, give the exact wording (3 words max) in double quotes. Leave videoPrompt as an empty string."
      : wantsVideo
        ? "- videoPrompt: a vivid, detailed prompt for an AI video generator (subject, motion, camera move, mood, ~5s clip). " +
          MEDIA_CRAFT +
          " No on-screen text, captions, or subtitles. Leave imagePrompt as an empty string."
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
export async function draftUgcAd(
  intent: string,
  hasReference: boolean,
  styleHint?: string,
  seconds = 20,
  /** Character Studio descriptor of whoever performs the ad (see personaBlock). */
  persona?: string,
): Promise<UgcAd> {
  // ~2.5 words a second is a natural talking-to-camera pace. The script used to
  // be pinned at "~30-45 words" from when clips maxed out near 15s; once 30s
  // became possible that left the model padding to fill the runtime.
  const len = Math.min(Math.max(Math.round(seconds), 4), 30);
  const words = Math.round(len * 2.5);
  const system = [
    "You are a top-performing UGC (user-generated content) ad creator for short-form video (TikTok/Reels/Shorts).",
    `Write a single ${len}-second ad as if a real person filmed it on their phone — casual, authentic, NOT polished or corporate.`,
    "Structure: a scroll-stopping hook in the first 2 seconds, a quick relatable why/problem, the product as the fix, and a clear CTA.",
    "Return:",
    "- hook: the exact opening line the creator says.",
    `- script: the full spoken script, first person, conversational. Aim for about ${words} words — that is what fills ${len} seconds at a natural pace, so do not pad or rush.`,
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
    // Reused VERBATIM. Paraphrasing the descriptor is exactly what makes a
    // recurring character drift into a different-looking person between ads.
    persona
      ? `This ad is performed by a specific recurring character. Write the script in THEIR voice, and begin videoPrompt with this description word for word:\n${persona}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return anthropicJson<UgcAd>({
    system,
    user: `Create a ${len}-second UGC ad about:\n\n${intent}`,
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
    "Every caption keeps a HOOK as its very first line — reuse the original's hook or sharpen it for the platform; never replace it with a label, greeting, or the brand name.",
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
