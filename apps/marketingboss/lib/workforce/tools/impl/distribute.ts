import "server-only";
import { defineTool, asObject, reqString, optString, strArray, oneOf, type ToolOutcome } from "../types";
import { adaptForPlatforms, type Draft } from "@/lib/ai";
import { getConnectionStatuses } from "@/lib/social";
import { publishToChannels } from "@/lib/publish-dispatch";
import { insertScheduledPost } from "@/lib/campaigns";
import { loadDestination, toFailure } from "./_shared";

/**
 * Emma — Social Manager. Wraps lib/publish-dispatch.ts and the scheduled queue.
 *
 * publish_post is the only publish-class tool in Phase 0. It defaults to
 * PROPOSING (scheduling a post the owner can see and cancel) and only sends
 * outright when the approval path has set `approvedByOwner`. That is the §15
 * rule made structural: nothing reaches the public because a model felt
 * confident.
 */

const CHANNELS = ["facebook", "instagram", "threads", "linkedin", "pinterest", "youtube", "tiktok"] as const;
const POST_TYPES = ["text", "image", "video"] as const;

type PostInput = {
  type: "text" | "image" | "video";
  title: string | null;
  caption: string;
  hashtags: string[];
  mediaUrl: string | null;
  link: string | null;
  channels: string[];
  scheduledFor: string | null;
};

function parsePost(raw: unknown): { ok: true; value: PostInput } | { ok: false; error: string } {
  const o = asObject(raw);
  const type = oneOf(o, "type", POST_TYPES);
  if (!type) return { ok: false, error: "Tell me whether this is a text, image, or video post." };
  const caption = reqString(o, "caption", 6000);
  if (!caption) return { ok: false, error: "The post needs a caption." };
  const channels = strArray(o, "channels", CHANNELS);
  if (channels.length === 0) return { ok: false, error: "Tell me which platforms this should go to." };
  const mediaUrl = optString(o, "mediaUrl", 1000);
  if (type !== "text" && !mediaUrl) {
    return { ok: false, error: `A ${type} post needs media. Render it with generate_media first, then pass the URL.` };
  }
  const scheduledFor = optString(o, "scheduledFor", 40);
  if (scheduledFor && Number.isNaN(Date.parse(scheduledFor))) {
    return { ok: false, error: `"${scheduledFor}" isn't a date I can read — use an ISO timestamp like 2026-09-01T14:00:00Z.` };
  }
  return {
    ok: true,
    value: {
      type,
      title: optString(o, "title", 200),
      caption,
      hashtags: strArray(o, "hashtags").map((h) => h.replace(/^#/, "")).slice(0, 12),
      mediaUrl,
      link: optString(o, "link", 500),
      channels,
      scheduledFor,
    },
  };
}

/** Per-platform captions, falling back to the base caption if tailoring fails. */
async function tailor(input: PostInput, link: string | null): Promise<Record<string, string>> {
  const draft: Draft = {
    title: input.title ?? "",
    caption: input.caption,
    cta: "",
    hashtags: input.hashtags,
    imagePrompt: "",
    videoPrompt: "",
  };
  const out: Record<string, string> = {};
  try {
    for (const p of await adaptForPlatforms(draft, link, input.channels)) out[p.platform] = p.caption;
  } catch {
    // Tailoring is an enhancement; losing it must not lose the post.
    for (const c of input.channels) out[c] = input.caption;
  }
  for (const c of input.channels) if (!out[c]) out[c] = input.caption;
  return out;
}

/** Which of the requested channels the account can actually post to. */
async function connectedOf(userId: string, channels: string[]): Promise<{ ready: string[]; missing: string[] }> {
  const statuses = await getConnectionStatuses(userId, channels);
  const ready = channels.filter((c) => statuses[c]?.connected);
  return { ready, missing: channels.filter((c) => !ready.includes(c)) };
}

const POST_SCHEMA_PROPS = {
  type: { type: "string", enum: [...POST_TYPES] },
  title: { type: "string", description: "Headline; also the video title on YouTube." },
  caption: { type: "string", description: "The post copy, including its call to action." },
  hashtags: { type: "array", items: { type: "string" }, description: "Without the # sign." },
  mediaUrl: { type: "string", description: "URL from generate_media. Required for image and video posts." },
  link: { type: "string", description: "CTA destination. Omit to use the business's configured website." },
  channels: { type: "array", items: { type: "string", enum: [...CHANNELS] } },
} as const;

export const schedulePost = defineTool<PostInput>({
  name: "schedule_post",
  worker: "social_manager",
  description:
    "Queue a post to go out at a specific time. It appears in the owner's Actions queue, tailored per platform, and " +
    "stays cancellable until it fires. This is the SAFE way to commit a post — prefer it over publish_post unless the " +
    "owner asked to send right now.",
  inputSchema: {
    type: "object",
    properties: {
      ...POST_SCHEMA_PROPS,
      scheduledFor: { type: "string", description: "ISO timestamp, e.g. 2026-09-01T14:00:00Z." },
    },
    required: ["type", "caption", "channels", "scheduledFor"],
    additionalProperties: false,
  },
  riskClass: "draft",
  estimateCredits: () => 0,
  parseInput(raw) {
    const parsed = parsePost(raw);
    if (!parsed.ok) return parsed;
    if (!parsed.value.scheduledFor) return { ok: false, error: "Tell me when this should go out." };
    return parsed;
  },
  async execute(ctx, input): Promise<ToolOutcome> {
    try {
      const { ready, missing } = await connectedOf(ctx.userId, input.channels);
      if (ready.length === 0) {
        return {
          status: "rejected",
          reason: `None of those platforms are connected yet (${input.channels.join(", ")}). The owner can connect them in Settings → Connections.`,
        };
      }
      const link = input.link ?? (await loadDestination(ctx.userId));
      const perPlatform = await tailor({ ...input, channels: ready }, link);
      const post = await insertScheduledPost(ctx.userId, {
        type: input.type,
        title: input.title,
        caption: input.caption,
        hashtags: input.hashtags,
        link,
        mediaUrl: input.mediaUrl,
        perPlatform,
        channels: ready,
        scheduledFor: input.scheduledFor!,
      });
      const when = new Date(input.scheduledFor!).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      return {
        status: "completed",
        summary: `Scheduled for ${when} on ${ready.join(", ")}.${missing.length ? ` Skipped ${missing.join(", ")} — not connected.` : ""}`,
        artifactUrl: "/actions",
        data: { postId: post.id, channels: ready, skipped: missing, scheduledFor: input.scheduledFor },
      };
    } catch (e) {
      return toFailure(e, "I couldn't schedule that post.");
    }
  },
});

export const publishPost = defineTool<PostInput>({
  name: "publish_post",
  worker: "social_manager",
  description:
    "Publish a post to the connected platforms RIGHT NOW. This is public and cannot be undone from here. Unless the " +
    "owner has already approved this exact post, it will be queued for their approval instead of sent — which is the " +
    "expected outcome, not a failure.",
  inputSchema: {
    type: "object",
    properties: POST_SCHEMA_PROPS,
    required: ["type", "caption", "channels"],
    additionalProperties: false,
  },
  riskClass: "publish",
  estimateCredits: () => 0,
  parseInput: parsePost,

  /** Approval path: park it in the queue a few minutes out, send nothing. */
  async propose(ctx, input): Promise<ToolOutcome> {
    const now = ctx.now ?? new Date();
    const soon = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    const parked = await schedulePost.execute(ctx, { ...input, scheduledFor: soon });
    if (parked.status !== "completed") return parked;
    return {
      status: "pending_approval",
      summary: `Ready to publish to ${input.channels.join(", ")} — waiting on your approval.`,
      proposal: parked.data,
    };
  },

  async execute(ctx, input): Promise<ToolOutcome> {
    try {
      const { ready, missing } = await connectedOf(ctx.userId, input.channels);
      if (ready.length === 0) {
        return {
          status: "rejected",
          reason: `None of those platforms are connected yet (${input.channels.join(", ")}). The owner can connect them in Settings → Connections.`,
        };
      }
      const link = input.link ?? (await loadDestination(ctx.userId));
      const perPlatform = await tailor({ ...input, channels: ready }, link);

      const results = await publishToChannels(ctx.userId, {
        type: input.type,
        mediaUrl: input.mediaUrl ?? undefined,
        link: link ?? undefined,
        title: input.title ?? undefined,
        posts: ready.map((platform) => ({ platform, caption: perPlatform[platform] })),
      });

      const ok = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok);

      if (ok.length === 0) {
        // Every platform rejected it. Say which and why in words the owner can act on.
        const why = failed.map((f) => `${f.platform} (${f.error ?? "rejected the post"})`).join("; ");
        return { status: "failed", error: `The post didn't go out anywhere. ${why}.`, retryable: true };
      }
      return {
        status: "completed",
        summary:
          `Published to ${ok.map((r) => r.platform).join(", ")}.` +
          (failed.length ? ` ${failed.map((f) => f.platform).join(", ")} failed and may need reconnecting.` : "") +
          (missing.length ? ` Skipped ${missing.join(", ")} — not connected.` : ""),
        artifactUrl: ok.find((r) => r.url)?.url ?? "/published",
        data: { published: ok, failed, skipped: missing },
      };
    } catch (e) {
      return toFailure(e, "I couldn't publish that post.");
    }
  },
});
