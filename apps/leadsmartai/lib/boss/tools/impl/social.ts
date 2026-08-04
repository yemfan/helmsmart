import "server-only";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { publishPost } from "@/lib/leads-gen/publish";
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

export const publishSocialPost = defineTool({
  name: "publish_social_post",
  description:
    "Publish a social post NOW on the agent's connected account (Facebook/Instagram/LinkedIn). Requires a connected account. In ask mode this parks the post for approval instead.",
  inputSchema: postInput,
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
    const res = await publishPost({
      agentId: ctx.agentId,
      platform: input.platform,
      connectionId: account.id,
      caption: input.caption,
      hashtags: input.hashtags,
      trigger: "boss_tool",
    });
    if (!res.ok) return { status: "failed", error: res.error };
    return {
      status: "completed",
      summary: `Published to ${input.platform}: "${input.caption.slice(0, 60)}…"`,
      data: { lead_post_id: res.leadPostId, url: res.externalPostUrl },
    };
  },
  propose: async (_ctx, input) => ({
    status: "pending_approval",
    summary: `Social post drafted for ${input.platform}: "${input.caption.slice(0, 80)}…"`,
    proposal: { platform: input.platform, caption: input.caption, hashtags: input.hashtags ?? [] },
  }),
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
      data: { scheduled_post_id: (data as { id: string }).id },
    };
  },
  propose: async (_ctx, input) => ({
    status: "pending_approval",
    summary: `Scheduled ${input.platform} post (for ${input.publish_at}) awaiting approval: "${input.caption.slice(0, 60)}…"`,
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
      proposal: { topic: input.topic, script: script.slice(0, 1200) },
    };
  },
});
