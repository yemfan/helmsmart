// publishToAll — the shared publish orchestrator.
//
// Built on the pure builders in this package: it validates each platform against
// what's publishable, pulls a fresh token from the app's ConnectionStore, sends
// the request the builder produced, drives the async container→publish dance for
// Instagram/Threads, and returns one terminal result per platform (never
// throws). Apps that used to hand-roll ~15 lines of fetch per platform call this
// instead and implement only ConnectionStore.

import {
  type ConnectionStore,
  type PlatformPublisher,
  type PostContent,
  type PublishContext,
  type PublishInput,
  type PublishResult,
  type SocialConnection,
} from "./connections";
import { outcomeForDuePost, type SocialPlatform } from "./platforms";
import {
  buildFacebookPostRequest,
  parseFacebookPostResponse,
  buildInstagramContainerRequest,
  buildInstagramPublishRequest,
  parseInstagramContainerResponse,
  parseInstagramPublishResponse,
  buildInstagramContainerStatusUrl,
  parseInstagramContainerStatusResponse,
  instagramNeedsImage,
} from "./meta-graph";
import {
  buildThreadsContainerRequest,
  buildThreadsPublishRequest,
  parseThreadsContainerResponse,
  parseThreadsPublishResponse,
  buildThreadsContainerStatusUrl,
  parseThreadsContainerStatusResponse,
  buildThreadsPermalinkUrl,
} from "./threads-graph";

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Async containers (IG/Threads) process off-band; bound the wait so a stuck one fails loudly. */
const CONTAINER_POLL_ATTEMPTS = 20;
const CONTAINER_POLL_INTERVAL_MS = 3000;

function firstImage(content: PostContent): string | null {
  return content.media.find((m) => m.kind === "image")?.url ?? null;
}

async function readJson(res: Response): Promise<unknown> {
  return res.json().catch(() => ({}));
}

// ─── Facebook ────────────────────────────────────────────────────────────────
const facebookPublisher: PlatformPublisher = {
  platform: "facebook",
  async publish({ content, connection, fetchImpl }: PublishContext): Promise<PublishResult> {
    const pageId = connection.metadata?.fbPageId || connection.providerAccountId || "";
    if (!pageId) return { platform: "facebook", ok: false, error: "No Facebook Page id on the connection.", retryable: false };
    const req = buildFacebookPostRequest({
      pageId,
      pageAccessToken: connection.accessToken,
      caption: content.caption,
      imageUrl: firstImage(content),
      link: content.link ?? null,
    });
    const res = await fetchImpl(req.url, { method: "POST", body: req.body });
    const out = parseFacebookPostResponse(res.status, await readJson(res));
    return out.ok
      ? { platform: "facebook", ok: true, externalId: out.postId, url: out.postUrl }
      : { platform: "facebook", ok: false, error: out.error, retryable: out.retryable };
  },
};

// ─── Instagram (two-step + async container) ──────────────────────────────────
const instagramPublisher: PlatformPublisher = {
  platform: "instagram",
  async publish({ content, connection, fetchImpl, sleep }: PublishContext): Promise<PublishResult> {
    const igUserId = connection.metadata?.igUserId || connection.providerAccountId || "";
    if (!igUserId) return { platform: "instagram", ok: false, error: "No Instagram user id on the connection.", retryable: false };
    const imageUrl = firstImage(content);
    if (instagramNeedsImage(imageUrl)) {
      return { platform: "instagram", ok: false, error: "Instagram requires an image.", retryable: false };
    }

    const create = buildInstagramContainerRequest({
      igUserId,
      pageAccessToken: connection.accessToken,
      caption: content.caption,
      imageUrl: imageUrl!,
    });
    const createRes = await fetchImpl(create.url, { method: "POST", body: create.body });
    const created = parseInstagramContainerResponse(createRes.status, await readJson(createRes));
    if (!created.ok) return { platform: "instagram", ok: false, error: created.error, retryable: created.retryable };

    // Wait for Meta to finish downloading/processing the image.
    for (let i = 0; i < CONTAINER_POLL_ATTEMPTS; i++) {
      const statusUrl = buildInstagramContainerStatusUrl({ containerId: created.containerId, accessToken: connection.accessToken });
      const stRes = await fetchImpl(statusUrl);
      const st = parseInstagramContainerStatusResponse(stRes.status, await readJson(stRes));
      if (st.state === "ready") break;
      if (st.state === "failed") return { platform: "instagram", ok: false, error: st.error, retryable: false };
      await sleep(CONTAINER_POLL_INTERVAL_MS);
    }

    const pub = buildInstagramPublishRequest({ igUserId, pageAccessToken: connection.accessToken, containerId: created.containerId });
    const pubRes = await fetchImpl(pub.url, { method: "POST", body: pub.body });
    const out = parseInstagramPublishResponse(pubRes.status, await readJson(pubRes));
    return out.ok
      ? { platform: "instagram", ok: true, externalId: out.postId, url: out.postUrl }
      : { platform: "instagram", ok: false, error: out.error, retryable: out.retryable };
  },
};

// ─── Threads (two-step + async container + permalink) ────────────────────────
const threadsPublisher: PlatformPublisher = {
  platform: "threads",
  async publish({ content, connection, fetchImpl, sleep }: PublishContext): Promise<PublishResult> {
    const userId = connection.metadata?.threadsUserId || connection.providerAccountId || "";
    if (!userId) return { platform: "threads", ok: false, error: "No Threads user id on the connection.", retryable: false };

    const create = buildThreadsContainerRequest({
      userId,
      accessToken: connection.accessToken,
      text: content.caption,
      imageUrl: firstImage(content),
    });
    const createRes = await fetchImpl(create.url, { method: "POST", body: create.body });
    const created = parseThreadsContainerResponse(createRes.status, await readJson(createRes));
    if (!created.ok) return { platform: "threads", ok: false, error: created.error, retryable: created.retryable };

    for (let i = 0; i < CONTAINER_POLL_ATTEMPTS; i++) {
      const statusUrl = buildThreadsContainerStatusUrl({ containerId: created.containerId, accessToken: connection.accessToken });
      const stRes = await fetchImpl(statusUrl);
      const st = parseThreadsContainerStatusResponse(stRes.status, await readJson(stRes));
      if (st.state === "ready") break;
      if (st.state === "failed") return { platform: "threads", ok: false, error: st.error, retryable: false };
      await sleep(CONTAINER_POLL_INTERVAL_MS);
    }

    const pub = buildThreadsPublishRequest({ userId, accessToken: connection.accessToken, containerId: created.containerId });
    const pubRes = await fetchImpl(pub.url, { method: "POST", body: pub.body });
    const out = parseThreadsPublishResponse(pubRes.status, await readJson(pubRes));
    if (!out.ok) return { platform: "threads", ok: false, error: out.error, retryable: out.retryable };

    // Best-effort permalink (post is already live).
    let url: string | null = null;
    try {
      const permRes = await fetchImpl(buildThreadsPermalinkUrl({ mediaId: out.postId, accessToken: connection.accessToken }));
      const perm = (await readJson(permRes)) as { permalink?: string };
      url = perm.permalink ?? null;
    } catch {
      /* ignore — permalink is a nicety */
    }
    return { platform: "threads", ok: true, externalId: out.postId, url };
  },
};

/** Publishers this package ships built-in (their pure builders live here too). */
export const BUILTIN_PUBLISHERS: Partial<Record<SocialPlatform, PlatformPublisher>> = {
  facebook: facebookPublisher,
  instagram: instagramPublisher,
  threads: threadsPublisher,
};

/**
 * Publish one piece of content to each requested platform. Never throws; returns
 * one terminal PublishResult per platform (the "no silent stall" contract from
 * platforms.ts, enforced at runtime).
 */
export async function publishToAll(input: PublishInput): Promise<PublishResult[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const sleep = defaultSleep;
  const publishers = { ...BUILTIN_PUBLISHERS, ...(input.publishers ?? {}) };
  const publishable = Object.keys(publishers) as SocialPlatform[];
  const results: PublishResult[] = [];

  for (const platform of input.platforms) {
    input.onEvent?.({ platform, phase: "validating" });

    const outcome = outcomeForDuePost(platform, publishable);
    if (outcome.action === "fail") {
      results.push({ platform, ok: false, error: outcome.reason, retryable: false });
      input.onEvent?.({ platform, phase: "error", detail: outcome.reason });
      continue;
    }

    let connection: SocialConnection | null;
    try {
      connection = await input.connections.get(platform);
    } catch (e) {
      const error = e instanceof Error ? e.message : "Could not load the connection.";
      results.push({ platform, ok: false, error, retryable: true });
      input.onEvent?.({ platform, phase: "error", detail: error });
      continue;
    }
    if (!connection) {
      const error = `${platform} isn't connected.`;
      results.push({ platform, ok: false, error, retryable: false });
      input.onEvent?.({ platform, phase: "error", detail: error });
      continue;
    }

    // Freshen the token (refresh + persist handled by the store).
    let accessToken = connection.accessToken;
    try {
      accessToken = await input.connections.freshAccessToken(platform);
    } catch {
      /* fall back to the stored token; the API call will 401 → retryable=false path */
    }

    const publisher = publishers[platform]!;
    const ctx: PublishContext = {
      content: input.content,
      connection: { ...connection, accessToken },
      fetchImpl,
      sleep,
      onEvent: input.onEvent,
    };

    input.onEvent?.({ platform, phase: "publishing" });
    try {
      const result = await publisher.publish(ctx);
      results.push(result);
      input.onEvent?.({ platform, phase: result.ok ? "done" : "error", detail: result.error });
    } catch (e) {
      const error = e instanceof Error ? e.message : "Publish failed.";
      results.push({ platform, ok: false, error, retryable: true });
      input.onEvent?.({ platform, phase: "error", detail: error });
    }
  }

  return results;
}
