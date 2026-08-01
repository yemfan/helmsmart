import "server-only";
import { publishToAll, type PostContent, type PublishResult, type SocialPlatform } from "@helm/dna-marketing";
import { createConnectionStore, getConnection, getValidAccessToken } from "@/lib/social";
import { linkedinPublisher, publishPinterest } from "@/lib/publishers";
import { uploadVideo } from "@/lib/youtube";
import { getValidTikTokAccessToken, publishVideo as tiktokPublishVideo } from "@/lib/tiktok";

/**
 * Publish one piece of content to each requested channel, each with its own
 * caption. Shared by the composer and the autopilot. Union platforms go through
 * the package orchestrator (LinkedIn plugged); Pinterest and YouTube are direct.
 */

// Platforms the shared publishToAll handles (LinkedIn is plugged below).
const UNION: SocialPlatform[] = ["facebook", "instagram", "threads", "linkedin"];

export type ChannelPost = { platform: string; caption: string };

export async function publishToChannels(
  userId: string,
  opts: { type: "text" | "image" | "video"; mediaUrl?: string; link?: string; title?: string; posts: ChannelPost[] },
): Promise<PublishResult[]> {
  const kind: "image" | "video" = opts.type === "video" ? "video" : "image";
  const media = opts.type === "text" || !opts.mediaUrl ? [] : [{ kind, url: opts.mediaUrl }];
  const store = createConnectionStore(userId);
  const results: PublishResult[] = [];

  for (const post of opts.posts) {
    const content: PostContent = { caption: post.caption, title: opts.title, link: opts.link, media };

    if ((UNION as string[]).includes(post.platform)) {
      const r = await publishToAll({
        platforms: [post.platform as SocialPlatform],
        content,
        connections: store,
        publishers: { linkedin: linkedinPublisher },
      });
      results.push(...r);
      continue;
    }

    if (post.platform === "pinterest") {
      const conn = await getConnection(userId, "pinterest").catch(() => null);
      if (!conn) {
        results.push({ platform: "pinterest" as never, ok: false, error: "Pinterest isn't connected.", retryable: false });
      } else {
        results.push(
          await publishPinterest({
            accessToken: conn.access_token,
            boardId: conn.metadata?.boardId ?? conn.provider_account_id,
            content,
          }),
        );
      }
      continue;
    }

    if (post.platform === "youtube") {
      const conn = await getConnection(userId, "youtube").catch(() => null);
      if (!conn) {
        results.push({ platform: "youtube" as never, ok: false, error: "YouTube isn't connected.", retryable: false });
        continue;
      }
      try {
        const accessToken = await getValidAccessToken(userId, conn);
        if (!opts.mediaUrl) throw new Error("No video to publish.");
        const res = await fetch(opts.mediaUrl);
        if (!res.ok) throw new Error(`Could not fetch the video (${res.status}).`);
        const contentType = res.headers.get("content-type") || "video/mp4";
        const bytes = new Uint8Array(await res.arrayBuffer());
        const videoId = await uploadVideo(accessToken, {
          bytes,
          contentType,
          title: opts.title || "MarketingBoss video",
          description: post.caption,
          privacy: "public",
        });
        results.push({ platform: "youtube" as never, ok: true, externalId: videoId, url: `https://youtu.be/${videoId}` });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "YouTube publish failed.";
        results.push({ platform: "youtube" as never, ok: false, error: msg, retryable: false });
      }
      continue;
    }

    if (post.platform === "tiktok") {
      const conn = await getConnection(userId, "tiktok").catch(() => null);
      if (!conn) {
        results.push({ platform: "tiktok" as never, ok: false, error: "TikTok isn't connected.", retryable: false });
        continue;
      }
      try {
        if (!opts.mediaUrl) throw new Error("No video to publish.");
        const token = await getValidTikTokAccessToken(userId, conn);
        const res = await fetch(opts.mediaUrl);
        if (!res.ok) throw new Error(`Could not fetch the video (${res.status}).`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const publishId = await tiktokPublishVideo(token, { bytes, title: post.caption || opts.title || "MarketingBoss" });
        // TikTok processes async — no immediate public URL; the publish_id is the receipt.
        results.push({ platform: "tiktok" as never, ok: true, externalId: publishId, url: null });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "TikTok publish failed.";
        results.push({ platform: "tiktok" as never, ok: false, error: msg, retryable: false });
      }
    }
  }

  return results;
}
