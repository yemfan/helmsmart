import "server-only";
import { defineTool, asObject, reqString, optString, strArray, intIn, oneOf, type ToolOutcome } from "../types";
import { planPosts } from "@/lib/planner";
import { createCampaign } from "@/lib/campaigns";
import { PLAYBOOK_TEMPLATES, getTemplate } from "@/lib/playbookTemplates";
import { templateHints } from "@/lib/viralIntelligence";
import { loadBrief, loadDestination, toFailure } from "./_shared";

/**
 * Max — Strategy Director. Wraps lib/planner.ts and the playbook (campaign)
 * creator. Nothing new is invented here: planPosts already returns a per-post
 * `reasoning`, which is what the activity feed shows as the "why".
 */

const MEDIA_TYPES = ["text", "image", "video"] as const;
const CHANNELS = ["facebook", "instagram", "threads", "linkedin", "pinterest", "youtube", "tiktok"] as const;

type PlanInput = {
  mediaTypes: string[];
  channels: string[];
  count: number;
  link: string | null;
  guidance: string | null;
};

export const planContent = defineTool<PlanInput>({
  name: "plan_content",
  worker: "strategy_director",
  description:
    "Plan a batch of posts from the account's brand brief: for each one an angle, a headline, caption, CTA, hashtags, " +
    "a media prompt, and one sentence of business reasoning. Rotates the brand's content pillars so a batch is varied. " +
    "Requires a brand brief — call get_business_profile first. This only PLANS; nothing is generated, saved, or posted.",
  inputSchema: {
    type: "object",
    properties: {
      mediaTypes: {
        type: "array",
        items: { type: "string", enum: ["text", "image", "video"] },
        description: "Formats the planner may choose from. Video costs 20 credits per post — include it only when asked for.",
      },
      channels: {
        type: "array",
        items: { type: "string", enum: [...CHANNELS] },
        description: "Target platforms.",
      },
      count: { type: "number", description: "How many posts to plan (1-10)." },
      link: { type: "string", description: "CTA destination. Omit to use the business's configured website." },
      guidance: { type: "string", description: "Extra steer for this batch — a trend to borrow, an angle to push, a season to hit." },
    },
    required: ["mediaTypes", "channels", "count"],
    additionalProperties: false,
  },
  riskClass: "draft",
  estimateCredits: () => 0,
  parseInput(raw) {
    const o = asObject(raw);
    const mediaTypes = strArray(o, "mediaTypes", MEDIA_TYPES);
    if (mediaTypes.length === 0) return { ok: false, error: "I need at least one format (text, image, or video) to plan with." };
    const channels = strArray(o, "channels", CHANNELS);
    if (channels.length === 0) return { ok: false, error: "I need at least one platform to plan for." };
    return {
      ok: true,
      value: {
        mediaTypes,
        channels,
        count: intIn(o, "count", 1, 10, 3),
        link: optString(o, "link", 500),
        guidance: optString(o, "guidance", 1200),
      },
    };
  },
  async execute(ctx, input): Promise<ToolOutcome> {
    try {
      const brief = await loadBrief(ctx.userId);
      if (!brief) {
        return {
          status: "rejected",
          reason:
            "There's no brand brief for this account yet, so any plan would be generic. Run research_business with the " +
            "owner's website first.",
        };
      }
      const link = input.link ?? (await loadDestination(ctx.userId)) ?? "";
      // The viral library's proven structures, folded in the same way the cron does.
      const styleHints = await templateHints().catch(() => null);

      const posts = await planPosts(brief, {
        mediaTypes: input.mediaTypes,
        channels: input.channels,
        link,
        count: input.count,
        insights: input.guidance,
        styleHints,
      });

      if (posts.length === 0) {
        return { status: "failed", error: "The planner didn't return any usable posts. Try again, or narrow the formats." };
      }
      return {
        status: "completed",
        summary: `Planned ${posts.length} post${posts.length === 1 ? "" : "s"} across ${input.channels.length} channel${input.channels.length === 1 ? "" : "s"}.`,
        data: { posts, link },
      };
    } catch (e) {
      return toFailure(e, "I couldn't put a content plan together just now.");
    }
  },
});

type PlaybookInput = {
  template: string | null;
  name: string;
  objective: string | null;
  mediaTypes: string[];
  channels: string[];
  frequency: number;
  budgetCredits: number | null;
  link: string | null;
};

export const createPlaybook = defineTool<PlaybookInput>({
  name: "create_playbook",
  worker: "strategy_director",
  description:
    "Create a standing playbook: a recurring campaign that keeps planning and producing posts on a cadence, within a " +
    "credit budget, under the owner's review. Use this for ongoing goals ('keep us posting three times a week'), not " +
    "for one-off posts. Always starts in review mode — the owner approves each post. " +
    `Available templates: ${PLAYBOOK_TEMPLATES.map((t) => t.key).join(", ")}.`,
  inputSchema: {
    type: "object",
    properties: {
      template: { type: "string", enum: PLAYBOOK_TEMPLATES.map((t) => t.key), description: "Template to seed defaults and milestones from." },
      name: { type: "string", description: "Short name for the playbook." },
      objective: { type: "string", description: "The business outcome in the owner's words." },
      mediaTypes: { type: "array", items: { type: "string", enum: ["text", "image", "video"] } },
      channels: { type: "array", items: { type: "string", enum: [...CHANNELS] } },
      frequency: { type: "number", description: "Posts per week (1-21)." },
      budgetCredits: { type: "number", description: "Optional ceiling on credits this playbook may spend." },
      link: { type: "string", description: "CTA destination. Omit to use the business's configured website." },
    },
    required: ["name", "mediaTypes", "channels", "frequency"],
    additionalProperties: false,
  },
  riskClass: "draft",
  estimateCredits: () => 0,
  parseInput(raw) {
    const o = asObject(raw);
    const name = reqString(o, "name", 120);
    if (!name) return { ok: false, error: "A playbook needs a name." };
    const mediaTypes = strArray(o, "mediaTypes", MEDIA_TYPES);
    if (mediaTypes.length === 0) return { ok: false, error: "A playbook needs at least one format to produce." };
    const channels = strArray(o, "channels", CHANNELS);
    if (channels.length === 0) return { ok: false, error: "A playbook needs at least one platform to post to." };
    const budget = Number(o.budgetCredits);
    return {
      ok: true,
      value: {
        template: oneOf(o, "template", PLAYBOOK_TEMPLATES.map((t) => t.key) as readonly string[]),
        name,
        objective: optString(o, "objective", 400),
        mediaTypes,
        channels,
        frequency: intIn(o, "frequency", 1, 21, 3),
        budgetCredits: Number.isFinite(budget) && budget > 0 ? Math.round(budget) : null,
        link: optString(o, "link", 500),
      },
    };
  },
  async execute(ctx, input): Promise<ToolOutcome> {
    try {
      const brief = await loadBrief(ctx.userId);
      if (!brief) {
        return {
          status: "rejected",
          reason: "A playbook plans from the brand brief, and this account doesn't have one yet. Run research_business first.",
        };
      }
      const link = input.link ?? (await loadDestination(ctx.userId));
      if (!link) {
        return {
          status: "rejected",
          reason:
            "This playbook has nowhere to send people. Ask the owner for the web address posts should link to, then " +
            "pass it as `link`.",
        };
      }
      const tpl = getTemplate(input.template);
      const campaign = await createCampaign(ctx.userId, {
        link,
        brief,
        name: input.name,
        mediaTypes: input.mediaTypes,
        channels: input.channels,
        frequency: input.frequency,
        budgetCredits: input.budgetCredits,
        // Review mode always. Autonomy is the owner's to turn up, never ours to assume.
        mode: "review",
        objective: input.objective ?? tpl?.objective ?? null,
        template: tpl?.key ?? null,
        milestones: tpl?.milestones ?? null,
      });
      return {
        status: "completed",
        summary: `Created the "${campaign.name ?? input.name}" playbook — ${input.frequency} posts a week, each one for your review.`,
        artifactUrl: `/playbooks/${campaign.id}`,
        data: { playbookId: campaign.id, mode: "review", milestones: tpl?.milestones ?? [] },
      };
    } catch (e) {
      return toFailure(e, "I couldn't create the playbook.");
    }
  },
});
