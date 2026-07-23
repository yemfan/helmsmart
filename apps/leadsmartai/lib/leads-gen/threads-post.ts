import "server-only";

import {
  buildThreadsContainerRequest,
  buildThreadsContainerStatusUrl,
  buildThreadsPermalinkUrl,
  buildThreadsPublishRequest,
  parseThreadsContainerResponse,
  parseThreadsContainerStatusResponse,
  parseThreadsPublishResponse,
} from "@helm/dna-marketing";

import { THREADS_GRAPH_BASE } from "@/lib/threads/graph";

/**
 * Threads publishing — the EFFECTS only.
 *
 * Everything that's easy to get wrong (endpoints, the two-step
 * container -> publish flow, the async container-status dance, which errors
 * are worth retrying) now lives in @helm/dna-marketing's `threads-graph`, so
 * CloseBoss and HelmSmart share one copy instead of drifting apart. This file
 * performs the fetches and adapts failures into the tagged Errors that
 * `publish.ts` expects.
 */

export type PublishResult = {
  externalPostId: string;
  externalPostUrl: string | null;
};

/** `publish.ts` classifies retryable-vs-permanent from `metaCode`. */
function tagError(message: string, code?: number | null): Error {
  const err = new Error(message);
  Object.assign(err, { metaCode: code ?? null });
  return err;
}

async function postForm(req: { url: string; body: URLSearchParams }) {
  const res = await fetch(req.url, { method: "POST", body: req.body });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

/**
 * Wait for the container to finish processing before publishing.
 *
 * Threads processes a container asynchronously; publishing immediately fails
 * with "The media with id … cannot be found" — and this bites even for
 * TEXT-only posts. Text is normally ready on the first check; an image can
 * take a few seconds.
 */
async function waitForContainer(
  containerId: string,
  accessToken: string,
): Promise<void> {
  const MAX_ATTEMPTS = 11; // ~25s worst case (first check is immediate)
  const DELAY_MS = 2500;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetch(
      buildThreadsContainerStatusUrl({
        containerId,
        accessToken,
        graphBase: THREADS_GRAPH_BASE,
      }),
    );
    const json = await res.json().catch(() => ({}));
    const state = parseThreadsContainerStatusResponse(res.status, json);
    if (state.state === "ready") return;
    if (state.state === "failed") throw tagError(state.error);
    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
  throw new Error(
    "Threads is still processing this post. Please try publishing again in a moment.",
  );
}

/**
 * Publish a post to Threads. `text` is required; `imageUrl` is optional —
 * unlike Instagram, Threads supports text-only posts.
 */
export async function publishThreadsPost(params: {
  userId: string;
  accessToken: string;
  text: string;
  imageUrl?: string | null;
}): Promise<PublishResult> {
  const { userId, accessToken, text, imageUrl } = params;
  const graphBase = THREADS_GRAPH_BASE;

  // 1. Create the media container.
  const created = await postForm(
    buildThreadsContainerRequest({ userId, accessToken, text, imageUrl, graphBase }),
  );
  const container = parseThreadsContainerResponse(created.status, created.json);
  if (!container.ok) throw tagError(container.error);

  // 2. Let Threads finish processing it.
  await waitForContainer(container.containerId, accessToken);

  // 3. Publish the container.
  const published = await postForm(
    buildThreadsPublishRequest({
      userId,
      accessToken,
      containerId: container.containerId,
      graphBase,
    }),
  );
  const result = parseThreadsPublishResponse(published.status, published.json);
  if (!result.ok) throw tagError(result.error, result.code);

  // 4. Resolve the public permalink — best-effort, the post is already live.
  let externalPostUrl: string | null = null;
  try {
    const res = await fetch(
      buildThreadsPermalinkUrl({ mediaId: result.postId, accessToken, graphBase }),
    );
    const json = (await res.json().catch(() => ({}))) as { permalink?: string };
    if (res.ok && json.permalink) externalPostUrl = json.permalink;
  } catch {
    // ignore
  }

  return { externalPostId: result.postId, externalPostUrl };
}
