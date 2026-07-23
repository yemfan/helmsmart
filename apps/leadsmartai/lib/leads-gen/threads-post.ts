import "server-only";

import { THREADS_GRAPH_BASE } from "@/lib/threads/graph";

/**
 * Threads posting helper — the two-step container → publish flow, modeled on
 * `publishInstagramBusinessPost` in meta-post.ts. Unlike Instagram, Threads
 * supports TEXT-ONLY posts (media_type=TEXT), which is the common case for the
 * brand auto-poster; an image is optional (media_type=IMAGE).
 *
 * Token: the Threads user access token (NOT a Facebook Page token) obtained via
 * lib/leads-gen/threads-oauth.ts and stored in social_accounts.user_access_token_enc.
 *
 * Throws on Threads-side rejection with the Graph-style error fields tagged
 * onto the Error (metaCode/metaTraceId/…) so `publishPost` classifies retryable
 * vs permanent the same way it does for Facebook/Instagram.
 */

export type PublishResult = {
  externalPostId: string;
  externalPostUrl: string | null;
};

type GraphError = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_user_msg?: string;
  fbtrace_id?: string;
};

function tagError(err: Error, ge: GraphError | undefined): Error {
  if (ge) {
    Object.assign(err, {
      metaCode: ge.code ?? null,
      metaSubcode: ge.error_subcode ?? null,
      metaUserMessage: ge.error_user_msg ?? null,
      metaTraceId: ge.fbtrace_id ?? null,
    });
  }
  return err;
}

/**
 * Poll a Threads media container until it's ready to publish.
 *
 * After you create a container, Threads processes it asynchronously; calling
 * publish too early fails with "media … cannot be found". We GET the
 * container's `status` until it reads FINISHED (text is usually ready on the
 * first check; images can take a few seconds). ERROR/EXPIRED are terminal and
 * surface the reason; a timeout throws a retryable-sounding message.
 */
async function waitForThreadsContainer(
  containerId: string,
  accessToken: string,
): Promise<void> {
  const MAX_ATTEMPTS = 11; // ~25s worst case (first check is immediate)
  const DELAY_MS = 2500;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetch(
      `${THREADS_GRAPH_BASE}/${containerId}?fields=status,error_message&access_token=${encodeURIComponent(
        accessToken,
      )}`,
    );
    const body = (await res.json().catch(() => ({}))) as {
      status?: string;
      error_message?: string;
      error?: GraphError;
    };
    const status = body.status;
    if (status === "FINISHED") return;
    if (status === "ERROR" || status === "EXPIRED") {
      throw tagError(
        new Error(
          `Threads container ${status.toLowerCase()}: ${
            body.error_message || "processing failed"
          }`,
        ),
        body.error,
      );
    }
    // IN_PROGRESS, an unknown status, or a transient GET failure — wait and
    // retry (but not after the final attempt).
    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
  throw new Error(
    "Threads is still processing this post. Please try publishing again in a moment.",
  );
}

/**
 * Publish a post to Threads.
 *
 * Two-step process per the Threads Publishing docs:
 *   1. POST /{user-id}/threads — create a media container. For a text post:
 *      media_type=TEXT + text. For an image post: media_type=IMAGE + image_url
 *      (+ text as the caption). Returns a creation id.
 *   2. POST /{user-id}/threads_publish — promote the container to a live post.
 *      Returns the Threads media id.
 *
 * When `imageUrl` is provided Threads downloads it during container creation,
 * so — exactly like Instagram — the URL must be PUBLICLY reachable for the
 * duration of the call (our signed library URLs and branded-card URLs are).
 *
 * `text` is required (Threads rejects an empty text container).
 */
export async function publishThreadsPost(params: {
  userId: string;
  accessToken: string;
  text: string;
  imageUrl?: string | null;
}): Promise<PublishResult> {
  const { userId, accessToken, text, imageUrl } = params;

  // Step 1: create the media container.
  const containerForm = new URLSearchParams();
  containerForm.set("access_token", accessToken);
  containerForm.set("text", text);
  if (imageUrl) {
    containerForm.set("media_type", "IMAGE");
    containerForm.set("image_url", imageUrl);
  } else {
    containerForm.set("media_type", "TEXT");
  }

  const containerRes = await fetch(`${THREADS_GRAPH_BASE}/${userId}/threads`, {
    method: "POST",
    body: containerForm,
  });
  type ContainerResp = { id?: string; error?: GraphError };
  const containerBody = (await containerRes
    .json()
    .catch(() => ({}))) as ContainerResp;
  if (!containerRes.ok || !containerBody.id) {
    const msg = containerBody.error?.message || `HTTP ${containerRes.status}`;
    throw tagError(
      new Error(`Threads media container creation failed: ${msg}`),
      containerBody.error,
    );
  }
  const containerId = containerBody.id;

  // Threads processes the container asynchronously. Publishing before it's
  // FINISHED returns "The media with id … cannot be found" — even for a
  // text-only post. Poll the container status until it's ready (usually
  // near-instant for text, a few seconds for an image) before publishing.
  await waitForThreadsContainer(containerId, accessToken);

  // Step 2: publish the container.
  const publishForm = new URLSearchParams();
  publishForm.set("creation_id", containerId);
  publishForm.set("access_token", accessToken);

  const publishRes = await fetch(
    `${THREADS_GRAPH_BASE}/${userId}/threads_publish`,
    { method: "POST", body: publishForm },
  );
  type PublishResp = { id?: string; error?: GraphError };
  const publishBody = (await publishRes.json().catch(() => ({}))) as PublishResp;
  if (!publishRes.ok || !publishBody.id) {
    const msg = publishBody.error?.message || `HTTP ${publishRes.status}`;
    throw tagError(
      new Error(`Threads publish failed: ${msg}`),
      publishBody.error,
    );
  }

  // Resolve the public permalink via /{media-id}?fields=permalink so the agent
  // can click through. Best-effort — the post is already live by now.
  let externalPostUrl: string | null = null;
  try {
    const permalinkRes = await fetch(
      `${THREADS_GRAPH_BASE}/${publishBody.id}?fields=permalink&access_token=${encodeURIComponent(
        accessToken,
      )}`,
    );
    const permalinkBody = (await permalinkRes.json().catch(() => ({}))) as {
      permalink?: string;
    };
    if (permalinkRes.ok && permalinkBody.permalink) {
      externalPostUrl = permalinkBody.permalink;
    }
  } catch {
    // ignore
  }

  return { externalPostId: publishBody.id, externalPostUrl };
}
