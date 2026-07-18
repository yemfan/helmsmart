import "server-only";

import { META_GRAPH_BASE } from "./meta-oauth";

/**
 * Meta Graph API posting helpers — Facebook Page feed + Instagram
 * Business content publish. Token + page-id resolution happens in
 * the caller (`/api/leads-gen/publish`); these helpers are pure
 * "given a token + an image URL + a caption, ship the post" wrappers.
 *
 * Both helpers throw on Meta-side rejection, with the most useful
 * Meta error fields stuffed into the message + onto the Error
 * object so the publish endpoint can surface them to the agent.
 */

export type PublishResult = {
  externalPostId: string;
  /** Public URL Meta returns for the published post (when available). */
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

// ── Facebook Page post ───────────────────────────────────────────────

/**
 * Publish to a Facebook Page.
 *
 * Two endpoints depending on whether we're attaching an image:
 *   - With image: POST /{page-id}/photos (image goes in the feed
 *     with caption as the post body — Meta's canonical "photo post")
 *   - Without image: POST /{page-id}/feed
 *
 * Returns the post id Meta minted ({page-id}_{post-id} format
 * for /feed; {photo-id} for /photos). The post URL is built from
 * the id when present.
 *
 * Token must be a Page Access Token (NOT a user token) — Page
 * tokens are what /me/accounts returns during OAuth.
 */
export async function publishFacebookPagePost(params: {
  pageId: string;
  pageAccessToken: string;
  caption: string;
  imageUrl: string | null;
  /** Optional URL to attach — Facebook renders a link preview card. Only
   *  meaningful on a /feed post; an image post is already the attachment, so
   *  Graph ignores `link` on /photos. */
  link?: string | null;
}): Promise<PublishResult> {
  const { pageId, pageAccessToken, caption, imageUrl, link } = params;

  let endpoint: string;
  const form = new URLSearchParams();
  form.set("access_token", pageAccessToken);

  if (imageUrl) {
    endpoint = `${META_GRAPH_BASE}/${pageId}/photos`;
    form.set("url", imageUrl);
    form.set("caption", caption);
    // Always publish (vs upload-then-publish-later). Phase 2 doesn't
    // schedule; that's a separate UX surface.
    form.set("published", "true");
  } else {
    endpoint = `${META_GRAPH_BASE}/${pageId}/feed`;
    form.set("message", caption);
    if (link && link.trim()) form.set("link", link.trim());
  }

  const res = await fetch(endpoint, {
    method: "POST",
    body: form,
  });
  type Resp = { id?: string; post_id?: string; error?: GraphError };
  const body = (await res.json().catch(() => ({}))) as Resp;

  if (!res.ok || (!body.id && !body.post_id)) {
    const msg = body.error?.message || `HTTP ${res.status}`;
    throw tagError(
      new Error(`Facebook publish failed: ${msg}`),
      body.error,
    );
  }

  // /feed returns { id: "<page-id>_<post-id>" } — that's the
  // post id directly. /photos returns { id: <photo-id>,
  // post_id: "<page-id>_<post-id>" }; we prefer post_id when
  // both are present so the URL points at the timeline post
  // (with the photo) rather than the standalone photo viewer.
  const externalPostId = body.post_id || body.id!;
  return {
    externalPostId,
    externalPostUrl: facebookPostUrl(externalPostId),
  };
}

/**
 * Build a viewable Facebook post URL from the Graph `post_id`.
 * Format: {page-id}_{post-id} → https://www.facebook.com/{page-id}/posts/{post-id}
 *
 * Returns null if the id doesn't have the expected underscore
 * format — defensive against future API quirks.
 */
function facebookPostUrl(externalPostId: string): string | null {
  const underscore = externalPostId.indexOf("_");
  if (underscore <= 0) return null;
  const pageId = externalPostId.slice(0, underscore);
  const postId = externalPostId.slice(underscore + 1);
  return `https://www.facebook.com/${pageId}/posts/${postId}`;
}

// ── Instagram Business post ──────────────────────────────────────────

/**
 * Publish to an Instagram Business account.
 *
 * Two-step process per Meta's IG Content Publishing docs:
 *   1. POST /{ig-user-id}/media — create a "media container" with
 *      the image_url + caption. Meta downloads the image at this
 *      point.
 *   2. POST /{ig-user-id}/media_publish — promote the container
 *      to a real post. Returns the media id.
 *
 * Important: Meta requires `image_url` to be PUBLICLY accessible
 * for the duration of the container creation. Our signed library
 * URLs are public-with-token for ~1h, which is more than enough.
 *
 * Token: the Page Access Token for the Page the IG Business is
 * linked to (NOT a user token, NOT a separate IG token).
 *
 * Image is required for IG. We surface this as a friendlier
 * "Instagram needs an image" check in the publish endpoint before
 * getting here — by the time control reaches this helper we
 * assume `imageUrl` is set.
 */
export async function publishInstagramBusinessPost(params: {
  igUserId: string;
  pageAccessToken: string;
  caption: string;
  imageUrl: string;
}): Promise<PublishResult> {
  const { igUserId, pageAccessToken, caption, imageUrl } = params;

  // Step 1: create the media container.
  const containerForm = new URLSearchParams();
  containerForm.set("image_url", imageUrl);
  containerForm.set("caption", caption);
  containerForm.set("access_token", pageAccessToken);

  const containerRes = await fetch(
    `${META_GRAPH_BASE}/${igUserId}/media`,
    { method: "POST", body: containerForm },
  );
  type ContainerResp = { id?: string; error?: GraphError };
  const containerBody = (await containerRes.json().catch(() => ({}))) as ContainerResp;
  if (!containerRes.ok || !containerBody.id) {
    const msg = containerBody.error?.message || `HTTP ${containerRes.status}`;
    throw tagError(
      new Error(`Instagram media container creation failed: ${msg}`),
      containerBody.error,
    );
  }
  const containerId = containerBody.id;

  // Step 2: publish the container.
  const publishForm = new URLSearchParams();
  publishForm.set("creation_id", containerId);
  publishForm.set("access_token", pageAccessToken);

  const publishRes = await fetch(
    `${META_GRAPH_BASE}/${igUserId}/media_publish`,
    { method: "POST", body: publishForm },
  );
  type PublishResp = { id?: string; error?: GraphError };
  const publishBody = (await publishRes.json().catch(() => ({}))) as PublishResp;
  if (!publishRes.ok || !publishBody.id) {
    const msg = publishBody.error?.message || `HTTP ${publishRes.status}`;
    throw tagError(
      new Error(`Instagram publish failed: ${msg}`),
      publishBody.error,
    );
  }

  // Resolve the public IG URL via /{media-id}?fields=permalink so
  // the agent can click through to view the post. Best-effort —
  // failure here doesn't fail the publish since the post is already
  // live by this point.
  let externalPostUrl: string | null = null;
  try {
    const permalinkRes = await fetch(
      `${META_GRAPH_BASE}/${publishBody.id}?fields=permalink&access_token=${encodeURIComponent(
        pageAccessToken,
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

  return {
    externalPostId: publishBody.id,
    externalPostUrl,
  };
}

// ── Per-post insights ────────────────────────────────────────────────

/**
 * Normalized engagement snapshot — what we persist on
 * lead_posts.metrics. Whichever fields a platform doesn't expose
 * come back as null so the UI can render "—" instead of zero. The
 * `refreshedAt` field is stamped client-side by the caller, not by
 * Meta.
 */
export type PostInsights = {
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  /** Sum of all reactions on FB; equal to likes on IG. */
  reactionsTotal: number | null;
};

type InsightsResp = {
  data?: Array<{
    name?: string;
    values?: Array<{ value?: number | Record<string, number> }>;
  }>;
  error?: GraphError;
};

/**
 * Pull engagement counts for a Facebook Page post.
 *
 * Two-step request (parallelized):
 *  1. /{post-id}?fields=reactions.summary(true),comments.summary(true),shares
 *     — public engagement counts (likes / comments / shares).
 *  2. /{post-id}/insights?metric=post_impressions,post_impressions_unique,post_clicks
 *     — impressions / reach / clicks (Page-admin-only insights).
 *
 * Either call is allowed to fail individually — we merge whatever
 * came back and leave the missing fields null. This is robust to
 * "post was deleted on Meta's side" (404) where one half might
 * still succeed.
 */
export async function fetchFacebookPostInsights(params: {
  externalPostId: string;
  pageAccessToken: string;
}): Promise<PostInsights> {
  const { externalPostId, pageAccessToken } = params;

  const fieldsUrl =
    `${META_GRAPH_BASE}/${externalPostId}` +
    `?fields=reactions.summary(true),comments.summary(true),shares` +
    `&access_token=${encodeURIComponent(pageAccessToken)}`;
  const insightsUrl =
    `${META_GRAPH_BASE}/${externalPostId}/insights` +
    `?metric=post_impressions,post_impressions_unique,post_clicks` +
    `&access_token=${encodeURIComponent(pageAccessToken)}`;

  const [fieldsRes, insightsRes] = await Promise.all([
    fetch(fieldsUrl).catch(() => null),
    fetch(insightsUrl).catch(() => null),
  ]);

  // Fields → likes / comments / shares.
  let reactionsTotal: number | null = null;
  let comments: number | null = null;
  let shares: number | null = null;
  if (fieldsRes && fieldsRes.ok) {
    type FieldsBody = {
      reactions?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
      shares?: { count?: number };
    };
    const body = (await fieldsRes.json().catch(() => ({}))) as FieldsBody;
    reactionsTotal = body.reactions?.summary?.total_count ?? null;
    comments = body.comments?.summary?.total_count ?? null;
    shares = body.shares?.count ?? null;
  }

  // Insights → impressions / reach / clicks.
  let impressions: number | null = null;
  let reach: number | null = null;
  let clicks: number | null = null;
  if (insightsRes && insightsRes.ok) {
    const body = (await insightsRes.json().catch(() => ({}))) as InsightsResp;
    for (const row of body.data ?? []) {
      const v = row.values?.[0]?.value;
      const n = typeof v === "number" ? v : null;
      if (row.name === "post_impressions") impressions = n;
      else if (row.name === "post_impressions_unique") reach = n;
      else if (row.name === "post_clicks") clicks = n;
    }
  }

  return {
    likes: reactionsTotal,
    comments,
    shares,
    saves: null,
    impressions,
    reach,
    clicks,
    reactionsTotal,
  };
}

/**
 * Pull engagement counts for an Instagram Business media post.
 *
 *  1. /{media-id}?fields=like_count,comments_count
 *     — public counts (like_count maps to the heart, comments_count to comments).
 *  2. /{media-id}/insights?metric=impressions,reach,saved
 *     — admin-only engagement insights (saves are IG-specific).
 *
 * IG does not expose shares as a separate metric on regular feed
 * posts (reels have plays, but that's a Phase 3 thing). Returns
 * null for `shares` / `clicks`.
 */
export async function fetchInstagramPostInsights(params: {
  externalPostId: string;
  pageAccessToken: string;
}): Promise<PostInsights> {
  const { externalPostId, pageAccessToken } = params;

  const fieldsUrl =
    `${META_GRAPH_BASE}/${externalPostId}` +
    `?fields=like_count,comments_count` +
    `&access_token=${encodeURIComponent(pageAccessToken)}`;
  const insightsUrl =
    `${META_GRAPH_BASE}/${externalPostId}/insights` +
    `?metric=impressions,reach,saved` +
    `&access_token=${encodeURIComponent(pageAccessToken)}`;

  const [fieldsRes, insightsRes] = await Promise.all([
    fetch(fieldsUrl).catch(() => null),
    fetch(insightsUrl).catch(() => null),
  ]);

  let likes: number | null = null;
  let comments: number | null = null;
  if (fieldsRes && fieldsRes.ok) {
    type FieldsBody = { like_count?: number; comments_count?: number };
    const body = (await fieldsRes.json().catch(() => ({}))) as FieldsBody;
    likes = body.like_count ?? null;
    comments = body.comments_count ?? null;
  }

  let impressions: number | null = null;
  let reach: number | null = null;
  let saves: number | null = null;
  if (insightsRes && insightsRes.ok) {
    const body = (await insightsRes.json().catch(() => ({}))) as InsightsResp;
    for (const row of body.data ?? []) {
      const v = row.values?.[0]?.value;
      const n = typeof v === "number" ? v : null;
      if (row.name === "impressions") impressions = n;
      else if (row.name === "reach") reach = n;
      else if (row.name === "saved") saves = n;
    }
  }

  return {
    likes,
    comments,
    shares: null,
    saves,
    impressions,
    reach,
    clicks: null,
    reactionsTotal: likes,
  };
}

/**
 * Platform-agnostic insights dispatcher. Caller passes the
 * `lead_posts.platform` value + the external id; we hit the right
 * Graph endpoint and return a normalized snapshot.
 *
 * Returns null for LinkedIn — the consumer `w_member_social` scope
 * we use for organic posting doesn't expose post analytics. The
 * UI surface shows "metrics unavailable" for LinkedIn rows.
 */
export async function fetchPostInsights(params: {
  platform: "facebook" | "instagram" | "linkedin";
  externalPostId: string;
  pageAccessToken: string;
}): Promise<PostInsights | null> {
  if (params.platform === "facebook") {
    return fetchFacebookPostInsights({
      externalPostId: params.externalPostId,
      pageAccessToken: params.pageAccessToken,
    });
  }
  if (params.platform === "instagram") {
    return fetchInstagramPostInsights({
      externalPostId: params.externalPostId,
      pageAccessToken: params.pageAccessToken,
    });
  }
  return null;
}
