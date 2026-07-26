import "server-only";

import { PINTEREST_API_BASE, pinUrl } from "@/lib/pinterest/graph";

/**
 * Pinterest publishing — the EFFECTS only. A Pin is a single POST /v5/pins:
 * it needs a destination board, an image (via image_url — Pinterest fetches
 * it), and optionally a title, description, and outbound link.
 *
 * Adapts failures into a tagged Error `publish.ts` reads (`pinterestStatus`)
 * to classify retryable vs permanent.
 */

export type PublishResult = {
  externalPostId: string;
  externalPostUrl: string | null;
};

function tagError(message: string, status?: number | null): Error {
  const err = new Error(message);
  Object.assign(err, { pinterestStatus: status ?? null });
  return err;
}

type CreatePinResponse = {
  id?: string;
  message?: string;
  code?: number;
};

/** Publish a Pin. `imageUrl` and `boardId` are required by Pinterest. */
export async function publishPinterestPin(params: {
  accessToken: string;
  boardId: string;
  title: string;
  description: string;
  link: string | null;
  imageUrl: string;
}): Promise<PublishResult> {
  const { accessToken, boardId, title, description, link, imageUrl } = params;

  const body: Record<string, unknown> = {
    board_id: boardId,
    // Pinterest caps: title 100 chars, description 800 chars. Trim defensively.
    title: title.slice(0, 100),
    description: description.slice(0, 800),
    media_source: { source_type: "image_url", url: imageUrl },
  };
  if (link) body.link = link;

  const res = await fetch(`${PINTEREST_API_BASE}/pins`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as CreatePinResponse;
  if (!res.ok || !json.id) {
    const msg = json.message || `HTTP ${res.status}`;
    throw tagError(`Pinterest publish failed: ${msg}`, res.status);
  }

  return { externalPostId: json.id, externalPostUrl: pinUrl(json.id) };
}
