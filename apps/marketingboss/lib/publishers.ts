import "server-only";
import type { PlatformPublisher, PublishContext, PublishResult, PostContent } from "@helm/dna-marketing";

/**
 * MarketingBoss publishers for platforms the shared core doesn't ship built-in.
 * LinkedIn plugs into publishToAll (it's a package SocialPlatform); Pinterest is
 * published directly (not in the package's platform union yet).
 */

function firstImage(content: PostContent): string | null {
  return content.media.find((m) => m.kind === "image")?.url ?? null;
}

async function fetchBytes(url: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch the image (${res.status}).`);
  const contentType = res.headers.get("content-type") || "image/jpeg";
  return { bytes: new Uint8Array(await res.arrayBuffer()), contentType };
}

// ─── LinkedIn (member share; text or single image) ───────────────────────────
export const linkedinPublisher: PlatformPublisher = {
  platform: "linkedin",
  async publish({ content, connection, fetchImpl }: PublishContext): Promise<PublishResult> {
    const author = connection.metadata?.memberUrn || connection.providerAccountId || "";
    if (!author) return { platform: "linkedin", ok: false, error: "No LinkedIn member on the connection.", retryable: false };
    const token = connection.accessToken;
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    };

    const imageUrl = firstImage(content);
    let mediaCategory = "NONE";
    let media: { status: string; media: string }[] = [];

    if (imageUrl) {
      // 1) register an upload slot
      const regRes = await fetchImpl("https://api.linkedin.com/v2/assets?action=registerUpload", {
        method: "POST",
        headers,
        body: JSON.stringify({
          registerUploadRequest: {
            owner: author,
            recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
            serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
          },
        }),
      });
      const reg = (await regRes.json().catch(() => ({}))) as {
        value?: {
          asset?: string;
          uploadMechanism?: Record<string, { uploadUrl?: string }>;
        };
      };
      const asset = reg.value?.asset;
      const uploadUrl =
        reg.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
      if (!asset || !uploadUrl) return { platform: "linkedin", ok: false, error: "LinkedIn upload registration failed.", retryable: true };

      // 2) PUT the image bytes
      const { bytes } = await fetchBytes(imageUrl);
      const putRes = await fetchImpl(uploadUrl, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: bytes,
      });
      if (!putRes.ok) return { platform: "linkedin", ok: false, error: `LinkedIn image upload failed (${putRes.status}).`, retryable: true };

      mediaCategory = "IMAGE";
      media = [{ status: "READY", media: asset }];
    }

    // 3) create the post
    const postRes = await fetchImpl("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers,
      body: JSON.stringify({
        author,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: content.caption },
            shareMediaCategory: mediaCategory,
            ...(media.length ? { media } : {}),
          },
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      }),
    });
    const postBody = (await postRes.json().catch(() => ({}))) as { id?: string; message?: string };
    const id = postBody.id || postRes.headers.get("x-restli-id") || "";
    if (postRes.status >= 200 && postRes.status < 300 && id) {
      return { platform: "linkedin", ok: true, externalId: id, url: `https://www.linkedin.com/feed/update/${id}` };
    }
    return {
      platform: "linkedin",
      ok: false,
      error: `LinkedIn publish failed: ${postBody.message || `HTTP ${postRes.status}`}`,
      retryable: postRes.status === 429 || postRes.status >= 500,
    };
  },
};

// ─── Pinterest (create a pin from an image URL) ──────────────────────────────
export async function publishPinterest(opts: {
  accessToken: string;
  boardId: string | null;
  content: PostContent;
}): Promise<PublishResult> {
  const imageUrl = firstImage(opts.content);
  if (!imageUrl) return { platform: "pinterest" as never, ok: false, error: "Pinterest needs an image.", retryable: false };
  if (!opts.boardId) return { platform: "pinterest" as never, ok: false, error: "No Pinterest board — reconnect and pick a board.", retryable: false };

  const title = (opts.content.title || opts.content.caption || "MarketingBoss").slice(0, 100);
  const res = await fetch("https://api.pinterest.com/v5/pins", {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      board_id: opts.boardId,
      title,
      description: opts.content.caption.slice(0, 800),
      // The CTA destination, when the composer supplied one.
      ...(opts.content.link ? { link: opts.content.link } : {}),
      media_source: { source_type: "image_url", url: imageUrl },
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (res.status >= 200 && res.status < 300 && body.id) {
    return { platform: "pinterest" as never, ok: true, externalId: body.id, url: `https://www.pinterest.com/pin/${body.id}/` };
  }
  return {
    platform: "pinterest" as never,
    ok: false,
    error: `Pinterest publish failed: ${body.message || `HTTP ${res.status}`}`,
    retryable: res.status === 429 || res.status >= 500,
  };
}
