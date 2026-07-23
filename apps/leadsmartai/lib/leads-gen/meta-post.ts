import "server-only";

import {
  buildFacebookPostRequest,
  buildInstagramContainerRequest,
  buildInstagramPublishRequest,
  parseFacebookPostResponse,
  parseInstagramContainerResponse,
  parseInstagramPublishResponse,
} from "@helm/dna-marketing";

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

/**
 * Adapt a shared-core failure outcome into the tagged Error `publish.ts`
 * expects. The core already folded Meta's human-facing `error_user_msg` into
 * `error`, so the message is the useful one; `metaCode` drives the
 * retryable-vs-permanent classification downstream.
 */
function tagOutcomeError(message: string, code?: number | null): Error {
  const err = new Error(message);
  Object.assign(err, { metaCode: code ?? null });
  return err;
}

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

  // Endpoint choice (/photos vs /feed), field names, and the
  // {page-id}_{post-id} → URL shape all live in @helm/dna-marketing.
  const req = buildFacebookPostRequest({
    pageId,
    pageAccessToken,
    caption,
    imageUrl,
    link,
    graphBase: META_GRAPH_BASE,
  });
  const res = await fetch(req.url, { method: "POST", body: req.body });
  const json = await res.json().catch(() => ({}));

  const outcome = parseFacebookPostResponse(res.status, json);
  if (!outcome.ok) throw tagOutcomeError(outcome.error, outcome.code);
  return {
    externalPostId: outcome.postId,
    externalPostUrl: outcome.postUrl,
  };
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

  // Step 1: create the media container. Meta downloads the image during this
  // call, so `imageUrl` must be publicly reachable right now.
  const containerReq = buildInstagramContainerRequest({
    igUserId,
    pageAccessToken,
    caption,
    imageUrl,
    graphBase: META_GRAPH_BASE,
  });
  const containerRes = await fetch(containerReq.url, {
    method: "POST",
    body: containerReq.body,
  });
  const containerJson = await containerRes.json().catch(() => ({}));
  const container = parseInstagramContainerResponse(
    containerRes.status,
    containerJson,
  );
  if (!container.ok) throw tagOutcomeError(container.error);

  // Step 2: promote the container to a real post.
  const publishReq = buildInstagramPublishRequest({
    igUserId,
    pageAccessToken,
    containerId: container.containerId,
    graphBase: META_GRAPH_BASE,
  });
  const publishRes = await fetch(publishReq.url, {
    method: "POST",
    body: publishReq.body,
  });
  const publishJson = await publishRes.json().catch(() => ({}));
  const outcome = parseInstagramPublishResponse(publishRes.status, publishJson);
  if (!outcome.ok) throw tagOutcomeError(outcome.error, outcome.code);

  // Resolve the public IG URL via /{media-id}?fields=permalink so the agent
  // can click through. Best-effort — the post is already live by this point.
  let externalPostUrl: string | null = null;
  try {
    const permalinkRes = await fetch(
      `${META_GRAPH_BASE}/${outcome.postId}?fields=permalink&access_token=${encodeURIComponent(
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
    externalPostId: outcome.postId,
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
