import "server-only";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { publishPost } from "@/lib/leads-gen/publish";
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
