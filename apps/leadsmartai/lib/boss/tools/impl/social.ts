import "server-only";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { publishPost } from "@/lib/leads-gen/publish";
import { getAnthropicClient } from "@/lib/anthropic";
import { asImageMediaType } from "@/lib/contact-intake/aiExtractContacts";
import {
  draftAvatarScript,
  getAvatarState,
  publishAvatarVideo,
  renderAvatarVideo,
} from "@/lib/agent/avatarStudio";
import { defineTool } from "../types";

async function findSocialAccount(
  agentId: string,
  platform: "facebook" | "instagram" | "linkedin",
): Promise<{ id: string } | null> {
  // Meta connection backs both facebook + instagram; linkedin is its own row.
  const provider = platform === "linkedin" ? "linkedin" : "meta";
  const { data } = await supabaseAdmin
    .from("social_accounts")
    .select("id")
    .eq("agent_id", agentId)
    .eq("platform", provider)
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null) ?? null;
}

const postInput = z.object({
  platform: z.enum(["facebook", "instagram", "linkedin"]),
  caption: z.string().min(10).max(2200),
  hashtags: z.array(z.string()).max(15).optional(),
});

/**
 * Draft a caption + hashtags from the image itself (vision) plus the agent's
 * brand memory (brand name + onboarding profile). Used when the agent asked to
 * post a photo but didn't dictate the words — the Marketing team writes them.
 */
async function generateSocialCaption(
  agentId: string,
  imageUrl: string,
): Promise<{ caption: string; hashtags: string[] } | null> {
  try {
    const { data: agentRow } = await supabaseAdmin
      .from("agents")
      .select("brand_name, onboarding")
      .eq("id", agentId)
      .maybeSingle();
    const agent = agentRow as { brand_name?: string | null; onboarding?: Record<string, string> | null } | null;
    const ob = agent?.onboarding ?? {};
    const context = [
      agent?.brand_name ? `Brand: ${agent.brand_name}` : null,
      ob.market ? `Market: ${ob.market}` : null,
      ob.focus ? `Works with: ${ob.focus}` : null,
      ob.goal ? `Current goal: ${ob.goal}` : null,
    ]
      .filter(Boolean)
      .join(". ");

    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const media = asImageMediaType(res.headers.get("content-type") ?? "");
    if (!media) return null;
    const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");

    const client = getAnthropicClient();
    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: media, data: b64 } },
            {
              type: "text",
              text: `You are the marketing assistant for a real estate agent. Write ONE social media caption for this image, in the agent's brand voice. Read any text in the image and use it.${context ? ` Context — ${context}.` : ""} Keep it 1-3 short sentences, warm and professional, with a light call to action. Then give 5-10 relevant hashtags (real estate + local). Respond ONLY as minified JSON: {"caption": string, "hashtags": string[]}.`,
            },
          ],
        },
      ],
    });
    const text = resp.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text) as { caption?: unknown; hashtags?: unknown };
    const caption = String(parsed.caption ?? "").trim();
    if (!caption) return null;
    const hashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags.map((h) => String(h)).slice(0, 15) : [];
    return { caption, hashtags };
  } catch {
    return null;
  }
}

/** Use the agent's own caption if they wrote one; otherwise draft it from the image. */
async function resolveCaption(
  agentId: string,
  input: { caption?: string; hashtags?: string[]; image_url?: string },
): Promise<{ caption: string; hashtags: string[] } | { error: string }> {
  if (input.caption && input.caption.trim().length >= 3) {
    return { caption: input.caption.trim(), hashtags: input.hashtags ?? [] };
  }
  if (!input.image_url) {
    return { error: "Give me the caption text, or attach a photo and I'll write one." };
  }
  const gen = await generateSocialCaption(agentId, input.image_url);
  if (!gen) return { error: "I couldn't draft a caption from that image — send me a caption to use." };
  return { caption: gen.caption, hashtags: input.hashtags?.length ? input.hashtags : gen.hashtags };
}

export const publishSocialPost = defineTool({
  name: "publish_social_post",
  description:
    "Publish a social post NOW on the agent's connected account (Facebook/Instagram/LinkedIn). Pass image_url to attach a photo (required for Instagram). If the agent wrote their own caption, pass it; otherwise OMIT caption/hashtags and the Marketing team drafts them from the image + the agent's brand. NEVER ask the agent to write a caption. To post to ALL socials, call this once per platform. In ask mode the drafted post is parked for the agent to approve or edit.",
  inputSchema: postInput.extend({
    caption: z
      .string()
      .max(2200)
      .optional()
      .describe("Only if the agent dictated the words; otherwise omit and the team drafts it from the image."),
    image_url: z
      .string()
      .url()
      .optional()
      .describe("Public URL of an image to attach (e.g. a photo the agent uploaded)."),
  }),
  riskClass: "outbound",
  assignee: "marketing_assistant",
  outbound: { channel: () => "social" as const },
  execute: async (ctx, input) => {
    const account = await findSocialAccount(ctx.agentId, input.platform);
    if (!account) {
      return {
        status: "failed",
        error: `No connected ${input.platform} account — connect it under Marketing first.`,
      };
    }
    const c = await resolveCaption(ctx.agentId, input);
    if ("error" in c) return { status: "failed", error: c.error };
    const res = await publishPost({
      agentId: ctx.agentId,
      platform: input.platform,
      connectionId: account.id,
      caption: c.caption,
      hashtags: c.hashtags,
      imageUrl: input.image_url ?? null,
      trigger: "boss_tool",
    });
    if (!res.ok) return { status: "failed", error: res.error };
    return {
      status: "completed",
      summary: `Published to ${input.platform}: "${c.caption.slice(0, 60)}…"`,
      // The platform is a brand name and the caption is the agent's own
      // words — both travel as params, neither gets translated.
      display: {
        key: "social.published",
        params: { platform: input.platform, excerpt: c.caption.slice(0, 60) },
      },
      data: { lead_post_id: res.leadPostId, url: res.externalPostUrl },
    };
  },
  propose: async (ctx, input) => {
    const c = await resolveCaption(ctx.agentId, input);
    if ("error" in c) return { status: "failed", error: c.error };
    return {
      status: "pending_approval",
      summary: `${input.platform} post drafted${input.image_url ? " (with photo)" : ""}: "${c.caption.slice(0, 80)}…"`,
      display: {
        key: input.image_url ? "social.draftedWithPhoto" : "social.drafted",
        params: { platform: input.platform, excerpt: c.caption.slice(0, 80) },
      },
      proposal: { platform: input.platform, caption: c.caption, hashtags: c.hashtags, image_url: input.image_url ?? null },
    };
  },
});

type SocialPlatform = "facebook" | "instagram" | "linkedin";

/** Which of the three the agent can actually post to right now. */
async function connectedPlatforms(agentId: string): Promise<SocialPlatform[]> {
  const { data } = await supabaseAdmin
    .from("social_accounts")
    .select("id, platform, fb_page_id, ig_business_user_id, linkedin_member_urn, status")
    .eq("agent_id", agentId);
  const rows = (data as
    | {
        id: string;
        platform: string;
        fb_page_id: string | null;
        ig_business_user_id: string | null;
        linkedin_member_urn: string | null;
        status: string | null;
      }[]
    | null) ?? [];
  const live = rows.filter((r) => r.status !== "revoked");
  const out: SocialPlatform[] = [];
  if (live.some((r) => r.platform === "meta" && r.fb_page_id)) out.push("facebook");
  if (live.some((r) => r.platform === "meta" && r.ig_business_user_id)) out.push("instagram");
  if (live.some((r) => r.platform === "linkedin" && r.linkedin_member_urn)) out.push("linkedin");
  return out;
}

export const publishPostEverywhere = defineTool({
  name: "publish_post_everywhere",
  description:
    "Publish ONE post across every channel the agent has connected (Facebook, Instagram, LinkedIn) — a single action and, in ask mode, a SINGLE approval covering all of them. Prefer this over calling publish_social_post per platform whenever the agent wants a post out broadly (\"post this everywhere\", \"announce my new listing\"). Pass image_url to attach a photo; Instagram is skipped when there is no image. Omit the caption and the Marketing team writes it.",
  inputSchema: z.object({
    caption: z
      .string()
      .max(2200)
      .optional()
      .describe("Only if the agent dictated the words; otherwise omit and the team drafts it."),
    hashtags: z.array(z.string()).max(15).optional(),
    image_url: z.string().url().optional().describe("Public image URL to attach. Instagram needs one."),
    platforms: z
      .array(z.enum(["facebook", "instagram", "linkedin"]))
      .optional()
      .describe("Limit to these channels. Omit to use every connected channel."),
  }),
  riskClass: "outbound",
  assignee: "marketing_assistant",
  outbound: { channel: () => "social" as const },
  execute: async (ctx, input) => {
    const available = await connectedPlatforms(ctx.agentId);
    const wanted = input.platforms?.length ? available.filter((p) => input.platforms!.includes(p)) : available;
    const targets = wanted.filter((p) => p !== "instagram" || !!input.image_url);
    if (targets.length === 0) {
      return {
        status: "failed",
        error:
          available.length === 0
            ? "No social channels are connected yet — connect them under Marketing first."
            : "Nothing to post to: Instagram needs an image, and the other channels were excluded.",
      };
    }

    const c = await resolveCaption(ctx.agentId, { caption: input.caption, hashtags: input.hashtags, image_url: input.image_url });
    if ("error" in c) return { status: "failed", error: c.error };

    const posted: string[] = [];
    const failed: string[] = [];
    for (const platform of targets) {
      const account = await findSocialAccount(ctx.agentId, platform);
      if (!account) {
        failed.push(`${platform} (not connected)`);
        continue;
      }
      const res = await publishPost({
        agentId: ctx.agentId,
        platform,
        connectionId: account.id,
        caption: c.caption,
        hashtags: c.hashtags,
        imageUrl: input.image_url ?? null,
        trigger: "boss_tool",
      });
      if (res.ok) posted.push(platform);
      else failed.push(`${platform} (${res.error})`);
    }

    if (posted.length === 0) {
      return { status: "failed", error: `Couldn't post anywhere — ${failed.join("; ")}.` };
    }
    return {
      status: "completed",
      summary:
        `Published to ${posted.join(", ")}` +
        (failed.length ? `. Didn't go out on ${failed.join("; ")}.` : "."),
      // A partial fan-out is the case worth reading carefully, so it says
      // plainly which networks did not take it rather than trailing a clause.
      display: failed.length
        ? {
            key: "social.publishedPartial",
            params: { posted: posted.join(", "), failed: failed.join(", ") },
          }
        : { key: "social.publishedAll", params: { posted: posted.join(", ") } },
      data: { posted, failed },
    };
  },
  propose: async (ctx, input) => {
    const available = await connectedPlatforms(ctx.agentId);
    const wanted = input.platforms?.length ? available.filter((p) => input.platforms!.includes(p)) : available;
    const targets = wanted.filter((p) => p !== "instagram" || !!input.image_url);
    if (targets.length === 0) {
      return {
        status: "failed",
        error:
          available.length === 0
            ? "No social channels are connected yet — connect them under Marketing first."
            : "Nothing to post to: Instagram needs an image, and the other channels were excluded.",
      };
    }
    const c = await resolveCaption(ctx.agentId, { caption: input.caption, hashtags: input.hashtags, image_url: input.image_url });
    if ("error" in c) return { status: "failed", error: c.error };
    return {
      status: "pending_approval",
      summary: `Post drafted for ${targets.join(", ")}${input.image_url ? " (with photo)" : ""}: "${c.caption.slice(0, 80)}…" — approve once and it goes to all ${targets.length}.`,
      display: {
        key: input.image_url ? "social.draftedAllWithPhoto" : "social.draftedAll",
        params: {
          count: targets.length,
          targets: targets.join(", "),
          excerpt: c.caption.slice(0, 80),
        },
      },
      proposal: { platforms: targets, caption: c.caption, hashtags: c.hashtags, image_url: input.image_url ?? null },
    };
  },
});

export const scheduleSocialPost = defineTool({
  name: "schedule_social_post",
  description:
    "Schedule a social post for a future time on the agent's connected account. In ask mode this parks the post for approval instead.",
  inputSchema: postInput.extend({
    publish_at: z.string().datetime({ offset: true, local: true }).describe("ISO time to publish"),
  }),
  riskClass: "outbound",
  assignee: "marketing_assistant",
  outbound: { channel: () => "social" as const },
  execute: async (ctx, input) => {
    const account = await findSocialAccount(ctx.agentId, input.platform);
    if (!account) {
      return {
        status: "failed",
        error: `No connected ${input.platform} account — connect it under Marketing first.`,
      };
    }
    const caption = input.hashtags?.length
      ? `${input.caption}\n\n${input.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}`
      : input.caption;
    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .insert({
        agent_id: ctx.agentId,
        social_account_id: account.id,
        platform: input.platform,
        caption,
        scheduled_for: input.publish_at,
        status: "scheduled",
      })
      .select("id")
      .single();
    if (error || !data) {
      return { status: "failed", error: error?.message ?? "Couldn't schedule the post." };
    }
    return {
      status: "completed",
      summary: `${input.platform} post scheduled for ${input.publish_at}.`,
      display: {
        key: "social.scheduled",
        params: { platform: input.platform, when: input.publish_at },
      },
      data: { scheduled_post_id: (data as { id: string }).id },
    };
  },
  propose: async (_ctx, input) => ({
    status: "pending_approval",
    summary: `Scheduled ${input.platform} post (for ${input.publish_at}) awaiting approval: "${input.caption.slice(0, 60)}…"`,
    display: {
      key: "social.scheduledAwaitingApproval",
      params: {
        platform: input.platform,
        when: input.publish_at,
        excerpt: input.caption.slice(0, 60),
      },
    },
    proposal: {
      platform: input.platform,
      caption: input.caption,
      hashtags: input.hashtags ?? [],
      publish_at: input.publish_at,
    },
  }),
});

const avatarInput = z.object({
  topic: z.string().min(3).max(300).describe("What the talking-head video should be about"),
});

/** Twin-readiness gate → a human-readable blocker, or null when good to go. */
async function avatarBlocker(agentId: string): Promise<string | null> {
  const state = await getAvatarState(agentId);
  if (!state.configured) return "Avatar video isn't set up on the server (needs FAL_KEY + ELEVENLABS_API_KEY).";
  if (!state.hasIntroVideo || !state.voiceReady) {
    return "Set up your Digital Twin first — record your intro video and clone your voice in My Profile → Digital Twin.";
  }
  return null;
}

export const createAvatarVideo = defineTool({
  name: "create_avatar_video",
  description:
    "Film a short talking-head VIDEO of the agent (their digital-twin avatar) about a topic and post it to their connected social accounts (Facebook/Instagram/LinkedIn). Use ONLY for a VIDEO of themselves / an avatar or talking-head clip — a plain text or image post uses publish_social_post. Requires the agent's Digital Twin (intro video + cloned voice). Rendering spends credits.",
  inputSchema: avatarInput,
  riskClass: "outbound",
  assignee: "marketing_assistant",
  outbound: { channel: () => "social" as const },
  execute: async (ctx, input) => {
    const blocked = await avatarBlocker(ctx.agentId);
    if (blocked) return { status: "failed", error: blocked };

    const script = await draftAvatarScript(ctx.agentId, input.topic);
    if (!script.trim()) return { status: "failed", error: "Couldn't draft the video script." };

    let videoUrl: string | null = null;
    try {
      videoUrl = (await renderAvatarVideo(ctx.agentId, script, null)).videoUrl;
    } catch (e) {
      return { status: "failed", error: `Couldn't render the avatar video: ${e instanceof Error ? e.message : "render failed"}` };
    }

    const pub = await publishAvatarVideo(ctx.agentId).catch((e) => ({
      scheduled: 0,
      error: e instanceof Error ? e.message : "publish failed",
    }));
    if (pub.scheduled === 0) {
      return {
        status: "completed",
        summary: pub.error ?? "Avatar video made, but no connected social accounts to post to.",
        artifactUrl: videoUrl,
      };
    }
    return {
      status: "completed",
      summary: `Avatar video posted to ${pub.scheduled} account${pub.scheduled === 1 ? "" : "s"} — "${input.topic}"`,
        display: {
          key: "social.avatarPosted",
          params: { count: pub.scheduled, topic: input.topic },
        },
      artifactUrl: videoUrl,
      data: { accounts: pub.scheduled },
    };
  },
  propose: async (ctx, input) => {
    const blocked = await avatarBlocker(ctx.agentId);
    if (blocked) return { status: "failed", error: blocked };
    const script = await draftAvatarScript(ctx.agentId, input.topic).catch(() => "");
    return {
      status: "pending_approval",
      summary: `Avatar video about "${input.topic}" — script drafted; approve to render + post (rendering spends credits).`,
      display: { key: "social.avatarScriptDrafted", params: { topic: input.topic } },
      proposal: { topic: input.topic, script: script.slice(0, 1200) },
    };
  },
});
