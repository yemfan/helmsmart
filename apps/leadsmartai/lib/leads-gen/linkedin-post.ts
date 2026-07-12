import "server-only";

import { LINKEDIN_API_BASE } from "./linkedin-oauth";

/**
 * LinkedIn Share API publishing — text + optional single image post
 * to the agent's personal LinkedIn feed.
 *
 * We use the v3 `/rest/posts` endpoint (the modern replacement for
 * the legacy v2 `/v2/ugcPosts`). v3 requires:
 *   - `Authorization: Bearer <token>`
 *   - `LinkedIn-Version: <YYYYMM>`  (pinned to a stable LinkedIn API version)
 *   - `X-Restli-Protocol-Version: 2.0.0`
 *
 * Image posting is a two-step flow:
 *   1. POST /rest/images?action=initializeUpload — returns an image URN + upload URL
 *   2. PUT the bytes to the upload URL
 *   3. Reference the image URN in the post's content.media field
 *
 * Returns the share URN (e.g. urn:li:share:1234567890) plus a clickable
 * post URL the agent can use to view the live post.
 */

// LinkedIn sunsets each YYYYMM API version ~12 months after release, returning
// HTTP 426 NONEXISTENT_VERSION once it lapses. Keep this within the last year.
const LINKEDIN_API_VERSION = "202506"; // bump to current Y-M when stale

type PostError = {
  message?: string;
  status?: number;
  code?: string;
  serviceErrorCode?: number;
};

function tagError(err: Error, body: { error?: PostError } | undefined): Error {
  if (body?.error) {
    Object.assign(err, {
      linkedinCode: body.error.code ?? null,
      linkedinServiceErrorCode: body.error.serviceErrorCode ?? null,
      linkedinMessage: body.error.message ?? null,
    });
  }
  return err;
}

export type LinkedInPublishResult = {
  externalPostId: string;
  externalPostUrl: string | null;
};

/**
 * Publish a text-only or single-image post to the agent's personal
 * LinkedIn feed.
 *
 * For image posts: download the bytes ourselves (signed-URL pull-
 * through hits LinkedIn auth weirdness) and use the two-step
 * register → upload → post flow.
 *
 * Visibility is hardcoded to PUBLIC (everyone) — there's no agent-
 * facing reason to surface CONNECTIONS-only or LOGGED_IN-only at
 * this point. Reshares are enabled by default.
 */
export async function publishLinkedInPost(params: {
  memberUrn: string;
  accessToken: string;
  caption: string;
  imageBytes: Uint8Array | null;
  imageContentType: string | null;
}): Promise<LinkedInPublishResult> {
  const { memberUrn, accessToken, caption, imageBytes, imageContentType } = params;

  let imageUrn: string | null = null;
  if (imageBytes && imageContentType) {
    imageUrn = await uploadImage({
      memberUrn,
      accessToken,
      imageBytes,
      imageContentType,
    });
  }

  // v3 posts schema. `content.media` is the image attachment (single
  // image only — multi-image posts use `content.multiImage`). No image
  // → `content` is omitted entirely (just text).
  const post: Record<string, unknown> = {
    author: memberUrn,
    commentary: caption,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (imageUrn) {
    post.content = {
      media: {
        id: imageUrn,
      },
    };
  }

  const res = await fetch(`${LINKEDIN_API_BASE}/rest/posts`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "linkedin-version": LINKEDIN_API_VERSION,
      "x-restli-protocol-version": "2.0.0",
      "content-type": "application/json",
    },
    body: JSON.stringify(post),
  });

  // /rest/posts returns 201 Created with an empty body and the post
  // URN in the `x-restli-id` response header. No JSON body to parse
  // on success.
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: PostError };
    const msg = body.error?.message || `HTTP ${res.status}`;
    throw tagError(new Error(`LinkedIn publish failed: ${msg}`), body);
  }
  const postUrn = res.headers.get("x-restli-id") ?? "";
  if (!postUrn) {
    throw new Error("LinkedIn publish succeeded but returned no x-restli-id");
  }

  return {
    externalPostId: postUrn,
    externalPostUrl: postUrlFromUrn(postUrn),
  };
}

/**
 * Build a viewable share URL from a urn:li:share:<id> URN. Returns
 * null when the URN doesn't fit the expected shape (defensive
 * against API quirks).
 */
function postUrlFromUrn(urn: string): string | null {
  // urn:li:share:1234567890 or urn:li:ugcPost:1234567890
  const match = urn.match(/^urn:li:(share|ugcPost):(\d+)$/);
  if (!match) return null;
  const [, kind, id] = match;
  if (kind === "share") {
    return `https://www.linkedin.com/feed/update/urn:li:share:${id}/`;
  }
  return `https://www.linkedin.com/feed/update/urn:li:ugcPost:${id}/`;
}

// ── Image upload (two-step) ──────────────────────────────────────────

type InitializeUploadResponse = {
  value?: {
    uploadUrlExpiresAt?: number;
    uploadUrl?: string;
    image?: string;
  };
  error?: PostError;
};

/**
 * Upload an image to LinkedIn's image library and return the image URN.
 * Two-step:
 *   1. POST /rest/images?action=initializeUpload → upload URL + image URN
 *   2. PUT the bytes to the upload URL
 * The image URN can then be attached to a post via content.media.
 */
async function uploadImage(params: {
  memberUrn: string;
  accessToken: string;
  imageBytes: Uint8Array;
  imageContentType: string;
}): Promise<string> {
  // Step 1: register upload.
  const initRes = await fetch(
    `${LINKEDIN_API_BASE}/rest/images?action=initializeUpload`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${params.accessToken}`,
        "linkedin-version": LINKEDIN_API_VERSION,
        "x-restli-protocol-version": "2.0.0",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: params.memberUrn,
        },
      }),
    },
  );
  const initBody = (await initRes.json().catch(() => ({}))) as InitializeUploadResponse;
  if (!initRes.ok || !initBody.value?.uploadUrl || !initBody.value?.image) {
    const msg = initBody.error?.message || `HTTP ${initRes.status}`;
    throw tagError(new Error(`LinkedIn image initializeUpload failed: ${msg}`), initBody);
  }
  const uploadUrl = initBody.value.uploadUrl;
  const imageUrn = initBody.value.image;

  // Step 2: upload bytes. LinkedIn's upload endpoint accepts a raw
  // binary PUT, NOT a multipart form — the content-type matches the
  // image MIME.
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      "content-type": params.imageContentType,
    },
    body: params.imageBytes as BodyInit,
  });
  if (!uploadRes.ok) {
    throw new Error(
      `LinkedIn image byte upload failed: HTTP ${uploadRes.status}`,
    );
  }

  return imageUrn;
}
