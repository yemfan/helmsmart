import "server-only";
import { anthropicJson, HOOK_RULE } from "@/lib/ai";
import type { BrandBrief } from "@/lib/research";

/**
 * Content planner: from a brand brief, plan a batch of social posts. For each,
 * the AI rotates through the content pillars and picks the single most effective
 * media type from the allowed set — so limiting types both caps cost and steers
 * the mix.
 */

export type PlannedPost = {
  type: "text" | "image" | "video";
  angle: string;
  title: string;
  caption: string;
  cta: string;
  hashtags: string[];
  mediaPrompt: string;
  /** The business case for this post — why this angle/format, shown in review. */
  reasoning: string;
};

function schema(allowed: string[]) {
  return {
    type: "object",
    properties: {
      posts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: allowed },
            angle: { type: "string" },
            title: { type: "string" },
            caption: { type: "string" },
            cta: { type: "string" },
            hashtags: { type: "array", items: { type: "string" } },
            mediaPrompt: { type: "string" },
            reasoning: { type: "string" },
          },
          required: ["type", "angle", "title", "caption", "cta", "hashtags", "mediaPrompt", "reasoning"],
          additionalProperties: false,
        },
      },
    },
    required: ["posts"],
    additionalProperties: false,
  };
}

export async function planPosts(
  brief: BrandBrief,
  opts: { mediaTypes: string[]; channels: string[]; link: string; count: number; insights?: string | null },
): Promise<PlannedPost[]> {
  const count = Math.min(Math.max(opts.count, 1), 10);

  const system = [
    "You are a social-media strategist planning a batch of posts for one brand.",
    "Rotate through the brand's content pillars so the batch is varied — no two posts on the same angle.",
    `For each post, choose the single most effective media type from the ALLOWED set (${opts.mediaTypes.join(", ")}) for that message and the target channels (${opts.channels.join(", ")}).`,
    ...(opts.insights ? [opts.insights] : []),
    "Write in the brand's voice. For each post return:",
    "- type: the chosen media type (from the allowed set).",
    "- angle: the pillar / hook this post covers (short).",
    "- title: a short headline (also a video title).",
    "- caption: ready-to-post copy, no hashtags inside it. " + HOOK_RULE,
    "- cta: one clear call to action.",
    "- hashtags: 4–8 relevant tags WITHOUT the # sign.",
    "- mediaPrompt: if type is image or video, a vivid generation prompt (subject, setting, style, lighting, composition, mood). Design the visual to work WITHOUT any rendered text — AI image models garble lettering, and the caption carries the words. Only when a short overlay is truly essential, give the exact wording (3 words max) in double quotes. If type is text, an empty string.",
    "- reasoning: ONE sentence making the business case — why this angle and format, for this audience, now. Written to the brand owner (\"Your audience...\"), concrete, no fluff.",
  ].join("\n");

  const user = [
    `Brand brief:\n${JSON.stringify(brief)}`,
    `Link (CTA destination): ${opts.link}`,
    "",
    `Plan ${count} distinct posts.`,
  ].join("\n");

  const out = await anthropicJson<{ posts: PlannedPost[] }>({
    system,
    user,
    schema: schema(opts.mediaTypes),
    maxTokens: 4000,
  });

  // Guard against a stray type the model may return outside the allowed set.
  return out.posts.filter((p) => opts.mediaTypes.includes(p.type)).slice(0, count);
}
