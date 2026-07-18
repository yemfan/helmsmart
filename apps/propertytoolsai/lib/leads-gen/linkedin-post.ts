import "server-only";

import { LINKEDIN_API_BASE } from "./linkedin-oauth";

/**
 * LinkedIn Share API publishing — text + optional single image post to the
 * member's personal LinkedIn feed. Ported from apps/leadsmartai.
 *
 * v3 `/rest/posts` endpoint requires:
 *   - `Authorization: Bearer <token>`
 *   - `LinkedIn-Version: <YYYYMM>`  (pinned to a stable LinkedIn API version)
 *   - `X-Restli-Protocol-Version: 2.0.0`
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
 * Publish a text-only or single-image post to the member's personal
 * LinkedIn feed. Visibility is hardcoded PUBLIC; reshares enabled.
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
    imageUrn = await uploadImage({ memberUrn, accessToken, imageBytes, imageContentType });
  }

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
    post.content = { media: { id: imageUrn } };
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

  // /rest/posts returns 201 Created with an empty body and the post URN in the
  // `x-restli-id` response header. No JSON body to parse on success.
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: PostError };
    const msg = body.error?.message || `HTTP ${res.status}`;
    throw tagError(new Error(`LinkedIn publish failed: ${msg}`), body);
  }
  const postUrn = res.headers.get("x-restli-id") ?? "";
  if (!postUrn) {
    throw new Error("LinkedIn publish succeeded but returned no x-restli-id");
  }

  return { externalPostId: postUrn, externalPostUrl: postUrlFromUrn(postUrn) };
}

function postUrlFromUrn(urn: string): string | null {
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
  value?: { uploadUrlExpiresAt?: number; uploadUrl?: string; image?: string };
  error?: PostError;
};

async function uploadImage(params: {
  memberUrn: string;
  accessToken: string;
  imageBytes: Uint8Array;
  imageContentType: string;
}): Promise<string> {
  const initRes = await fetch(`${LINKEDIN_API_BASE}/rest/images?action=initializeUpload`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      "linkedin-version": LINKEDIN_API_VERSION,
      "x-restli-protocol-version": "2.0.0",
      "content-type": "application/json",
    },
    body: JSON.stringify({ initializeUploadRequest: { owner: params.memberUrn } }),
  });
  const initBody = (await initRes.json().catch(() => ({}))) as InitializeUploadResponse;
  if (!initRes.ok || !initBody.value?.uploadUrl || !initBody.value?.image) {
    const msg = initBody.error?.message || `HTTP ${initRes.status}`;
    throw tagError(new Error(`LinkedIn image initializeUpload failed: ${msg}`), initBody);
  }
  const uploadUrl = initBody.value.uploadUrl;
  const imageUrn = initBody.value.image;

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      "content-type": params.imageContentType,
    },
    body: params.imageBytes as BodyInit,
  });
  if (!uploadRes.ok) {
    throw new Error(`LinkedIn image byte upload failed: HTTP ${uploadRes.status}`);
  }

  return imageUrn;
}
