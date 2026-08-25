import "server-only";
import { defineTool, asObject, reqString, optString, oneOf, type ToolOutcome } from "../types";
import { draftPost, type PostType } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePostMediaAdmin, creditCost, BudgetError, CreditError } from "@/lib/generation";
import { loadBrandContext, loadCredits, toFailure } from "./_shared";

/**
 * Chris — Content Creator (copy) and Leo — Video Producer (media).
 *
 * generate_media is the only tool in Phase 0 that spends real money, so it is
 * the only one with a credit ceiling check in front of it. The executor enforces
 * the per-run ceiling; this tool additionally refuses when the account simply
 * cannot afford the render, because a friendly refusal beats a failed charge.
 */

const POST_TYPES = ["text", "image", "video"] as const;

type DraftInput = { intent: string; type: PostType };

export const draftPostTool = defineTool<DraftInput>({
  name: "draft_post",
  worker: "content_creator",
  description:
    "Write ONE post from a plain-language intent: headline, caption with a scroll-stopping hook, a single call to " +
    "action, hashtags, and — for image/video posts — a generation prompt. Uses the account's brand voice automatically. " +
    "Use this for a one-off post; use plan_content when you need a coordinated batch. Writes nothing to the database.",
  inputSchema: {
    type: "object",
    properties: {
      intent: { type: "string", description: "What the post should be about, in plain language." },
      type: { type: "string", enum: [...POST_TYPES], description: "text = copy only; image/video also returns a media prompt." },
    },
    required: ["intent", "type"],
    additionalProperties: false,
  },
  riskClass: "draft",
  estimateCredits: () => 0,
  parseInput(raw) {
    const o = asObject(raw);
    const intent = reqString(o, "intent", 2000);
    if (!intent) return { ok: false, error: "I need to know what the post should be about." };
    const type = oneOf(o, "type", POST_TYPES);
    if (!type) return { ok: false, error: "Tell me whether this is a text, image, or video post." };
    return { ok: true, value: { intent, type } };
  },
  async execute(ctx, input): Promise<ToolOutcome> {
    try {
      const brand = await loadBrandContext(ctx.userId);
      const draft = await draftPost(input.intent, input.type, brand || undefined);
      return {
        status: "completed",
        summary: `Drafted a ${input.type} post: "${draft.title}".`,
        data: {
          ...draft,
          // Say it plainly so the model doesn't assume the post exists somewhere.
          note: "This draft is not saved yet. Use schedule_post or publish_post to act on it.",
        },
      };
    } catch (e) {
      return toFailure(e, "I couldn't write that post.");
    }
  },
});

type GenerateInput = { prompt: string; type: "image" | "video" };

const MEDIA_TYPES = ["image", "video"] as const;

export const generateMedia = defineTool<GenerateInput>({
  name: "generate_media",
  worker: "video_producer",
  description:
    "Render an image or a video clip from a prompt and save it to the account's gallery. THIS SPENDS CREDITS: " +
    "1 for an image, 20 for a video. Only call it when the owner has asked for media or approved the spend, and say " +
    "what it will cost before you do. Video takes up to a couple of minutes.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "What to render — subject, setting, style, lighting, composition, mood." },
      type: { type: "string", enum: [...MEDIA_TYPES] },
    },
    required: ["prompt", "type"],
    additionalProperties: false,
  },
  riskClass: "generate",
  estimateCredits: (input) => creditCost(input.type, false),
  parseInput(raw) {
    const o = asObject(raw);
    const prompt = reqString(o, "prompt", 2000);
    if (!prompt) return { ok: false, error: "I need a prompt describing what to render." };
    const type = oneOf(o, "type", MEDIA_TYPES);
    if (!type) return { ok: false, error: "Tell me whether to render an image or a video." };
    return { ok: true, value: { prompt, type } };
  },
  async execute(ctx, input): Promise<ToolOutcome> {
    const cost = creditCost(input.type, false);
    try {
      const balance = await loadCredits(ctx.userId);
      if (balance < cost) {
        return {
          status: "rejected",
          reason: `A ${input.type} costs ${cost} credit${cost === 1 ? "" : "s"} and the account has ${balance}. Top up in Settings → Billing.`,
        };
      }

      const admin = createAdminClient();
      const { url, cost: spent } = await generatePostMediaAdmin(
        admin,
        ctx.userId,
        // Per-run ceiling lives on ToolRunState; pass it through as the budget so
        // the existing BudgetError path does the enforcing rather than a new one.
        ctx.runState.maxCredits,
        ctx.runState.creditsSpent,
        input.type,
        input.prompt,
      );
      ctx.runState.creditsSpent += spent;

      return {
        status: "completed",
        summary: `Rendered a ${input.type} (${spent} credit${spent === 1 ? "" : "s"}).`,
        artifactUrl: url,
        creditsSpent: spent,
        data: { mediaUrl: url, type: input.type, creditsSpent: spent },
      };
    } catch (e) {
      if (e instanceof BudgetError) {
        return {
          status: "rejected",
          reason: `That render would push this run past its credit ceiling (${ctx.runState.maxCredits}). Ask the owner to raise it or skip the media.`,
        };
      }
      if (e instanceof CreditError) {
        return { status: "rejected", reason: "The account ran out of credits mid-render, so nothing was charged. Top up in Settings → Billing." };
      }
      return toFailure(e, `I couldn't render that ${input.type}.`);
    }
  },
});
