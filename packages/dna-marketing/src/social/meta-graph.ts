// Meta Graph publishing — request builders and response parsers.
//
// PURE by design, per this package's convention: no fetch, no SDK, no secrets
// read from env. Core decides WHAT to send and what a reply MEANS; the app
// performs the effect. That keeps ~15 lines of fetch in each app while the
// knowledge below — which is the part that's easy to get wrong — lives once.
//
// The knowledge worth sharing:
//   - /photos vs /feed (Facebook's endpoint depends on whether there's an image)
//   - Instagram's mandatory TWO-STEP container dance
//   - the {page-id}_{post-id} format and how to turn it into a viewable URL
//   - where Meta hides the useful half of an error
//
// Posting to a Page is identical for a realtor and a dentist, so none of this
// belongs in a vertical.

/**
 * Meta deprecates a Graph version roughly TWO YEARS after release, after which
 * calls stop behaving predictably. Apps may override via env; this is the
 * shared default so two apps can't silently drift onto different versions —
 * which already happened once (a publisher on v21.0 next to an OAuth flow still
 * pinned to v19.0, itself already past its window).
 *
 * RECHECK ANNUALLY: https://developers.facebook.com/docs/graph-api/changelog
 */
export const META_GRAPH_VERSION = "v21.0";

export function metaGraphBase(version: string = META_GRAPH_VERSION): string {
  return `https://graph.facebook.com/${version}`;
}

export function metaOAuthDialog(version: string = META_GRAPH_VERSION): string {
  return `https://www.facebook.com/${version}/dialog/oauth`;
}

/** A ready-to-send POST: the app just fetches it. */
export type GraphRequest = { url: string; body: URLSearchParams };

export type GraphError = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_user_msg?: string;
  fbtrace_id?: string;
};

export type MetaPublishOutcome =
  | { ok: true; postId: string; postUrl: string | null }
  | { ok: false; error: string; retryable: boolean; code?: number };

// ─── Facebook Page ─────────────────────────────────────────────────────────────

/**
 * Build the Facebook Page publish request.
 *
 * The endpoint depends on the image, which is the bit people get wrong:
 *   - with an image → /{page-id}/photos, caption as the post body (Meta's
 *     canonical "photo post")
 *   - without      → /{page-id}/feed, message as the body
 *
 * `link` renders a preview card and is only meaningful on /feed — an image post
 * IS the attachment, so Graph ignores it on /photos.
 *
 * The token MUST be a Page Access Token, not a user token. Page tokens are what
 * /me/accounts returns during OAuth; using a user token here fails in a way the
 * error message does not make obvious.
 */
export function buildFacebookPostRequest(params: {
  pageId: string;
  pageAccessToken: string;
  caption: string;
  imageUrl?: string | null;
  link?: string | null;
  graphBase?: string;
}): GraphRequest {
  const base = params.graphBase ?? metaGraphBase();
  const body = new URLSearchParams();
  body.set("access_token", params.pageAccessToken);

  if (params.imageUrl) {
    body.set("url", params.imageUrl);
    body.set("caption", params.caption);
    body.set("published", "true");
    return { url: `${base}/${params.pageId}/photos`, body };
  }

  body.set("message", params.caption);
  if (params.link?.trim()) body.set("link", params.link.trim());
  return { url: `${base}/${params.pageId}/feed`, body };
}

/**
 * Interpret a Facebook publish reply.
 *
 * /feed returns { id: "<page>_<post>" }. /photos returns { id: <photo-id>,
 * post_id: "<page>_<post>" } — prefer post_id so the URL points at the timeline
 * post rather than the standalone photo viewer.
 */
export function parseFacebookPostResponse(
  status: number,
  json: unknown,
): MetaPublishOutcome {
  const body = (json ?? {}) as { id?: string; post_id?: string; error?: GraphError };
  const postId = body.post_id || body.id;
  if (status >= 200 && status < 300 && postId) {
    return { ok: true, postId, postUrl: facebookPostUrl(postId) };
  }
  return graphFailure(status, body.error, "Facebook");
}

/** {page-id}_{post-id} → a viewable URL. Null if the id isn't that shape. */
export function facebookPostUrl(postId: string): string | null {
  const i = postId.indexOf("_");
  if (i <= 0) return null;
  return `https://www.facebook.com/${postId.slice(0, i)}/posts/${postId.slice(i + 1)}`;
}

// ─── Instagram Business ────────────────────────────────────────────────────────

/**
 * Instagram REQUIRES an image — there is no text-only post. Check before
 * queueing so the author is told at compose time rather than at publish time.
 */
export function instagramNeedsImage(imageUrl?: string | null): boolean {
  return !imageUrl?.trim();
}

/**
 * Step 1 of 2: create a media container. Meta downloads the image during this
 * call, so `imageUrl` must be PUBLICLY reachable at that moment — a signed URL
 * is fine as long as it hasn't expired.
 *
 * The token is the Page Access Token for the Page the IG Business account is
 * linked to — not a user token, and not a separate Instagram token.
 */
export function buildInstagramContainerRequest(params: {
  igUserId: string;
  pageAccessToken: string;
  caption: string;
  imageUrl: string;
  graphBase?: string;
}): GraphRequest {
  const base = params.graphBase ?? metaGraphBase();
  const body = new URLSearchParams();
  body.set("image_url", params.imageUrl);
  body.set("caption", params.caption);
  body.set("access_token", params.pageAccessToken);
  return { url: `${base}/${params.igUserId}/media`, body };
}

/** Step 2 of 2: promote the container to a real post. */
export function buildInstagramPublishRequest(params: {
  igUserId: string;
  pageAccessToken: string;
  containerId: string;
  graphBase?: string;
}): GraphRequest {
  const base = params.graphBase ?? metaGraphBase();
  const body = new URLSearchParams();
  body.set("creation_id", params.containerId);
  body.set("access_token", params.pageAccessToken);
  return { url: `${base}/${params.igUserId}/media_publish`, body };
}

/** Container creation → the id needed for step 2. */
export function parseInstagramContainerResponse(
  status: number,
  json: unknown,
): { ok: true; containerId: string } | { ok: false; error: string; retryable: boolean } {
  const body = (json ?? {}) as { id?: string; error?: GraphError };
  if (status >= 200 && status < 300 && body.id) return { ok: true, containerId: body.id };
  const f = graphFailure(status, body.error, "Instagram media container");
  return { ok: false, error: f.ok ? "" : f.error, retryable: f.ok ? false : f.retryable };
}

export function parseInstagramPublishResponse(
  status: number,
  json: unknown,
): MetaPublishOutcome {
  const body = (json ?? {}) as { id?: string; error?: GraphError };
  if (status >= 200 && status < 300 && body.id) {
    // IG's public URL needs a follow-up permalink lookup; the app does that
    // best-effort since the post is already live by this point.
    return { ok: true, postId: body.id, postUrl: null };
  }
  return graphFailure(status, body.error, "Instagram");
}

// ─── Errors ────────────────────────────────────────────────────────────────────

/**
 * Meta puts the message a HUMAN should read in `error_user_msg` and the one for
 * developers in `message`. Prefer the human one when present — this string ends
 * up in front of the person who wrote the post.
 */
export function graphErrorMessage(err: GraphError | undefined, status: number): string {
  return err?.error_user_msg || err?.message || `HTTP ${status}`;
}

/**
 * Is retrying worth it?
 *
 * Retrying a revoked token forever is noise; giving up on a rate limit loses a
 * post that would have worked. Codes: 4/17/32/613 = throttling, 2 = transient
 * Meta error, 190 = token invalid (never retry — it needs a human to reconnect).
 */
export function isRetryableGraphError(err: GraphError | undefined, status: number): boolean {
  const code = err?.code;
  if (code === 190) return false;
  if (code !== undefined && [1, 2, 4, 17, 32, 613].includes(code)) return true;
  return status === 429 || status >= 500;
}

function graphFailure(
  status: number,
  err: GraphError | undefined,
  label: string,
): MetaPublishOutcome {
  return {
    ok: false,
    error: `${label} publish failed: ${graphErrorMessage(err, status)}`,
    retryable: isRetryableGraphError(err, status),
    code: err?.code,
  };
}
