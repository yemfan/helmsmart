// Threads publishing — request builders and response parsers.
//
// PURE by design, same convention as meta-graph.ts: no fetch, no SDK, no secrets
// read from env. Core decides WHAT to send and what a reply MEANS; the app
// performs the effect.
//
// Threads is a Meta product but a DISTINCT API from the Facebook Graph:
//   - its own host (graph.threads.net, not graph.facebook.com)
//   - its own OAuth dialog (threads.net, not facebook.com)
//   - its own two-step container -> publish flow (like Instagram) — BUT
//     text-only posts are allowed (media_type=TEXT), unlike Instagram
//   - a Facebook Page token CANNOT post here; the account authorizes Threads
//     separately and gets its own user token
//
// Posting a thread is identical for a realtor and a dentist, so — like the Meta
// Graph knowledge — none of this belongs in a vertical. Error shapes match the
// Graph API, so the shared graphErrorMessage/isRetryableGraphError apply.

import {
  type GraphError,
  type GraphRequest,
  type MetaPublishOutcome,
  graphErrorMessage,
  isRetryableGraphError,
} from "./meta-graph";

/**
 * Threads API version. Env-overridable in the app, but this is the shared
 * default so two apps can't silently drift.
 * RECHECK ANNUALLY: https://developers.facebook.com/docs/threads/changelog
 */
export const THREADS_GRAPH_VERSION = "v1.0";

/** REST base, e.g. https://graph.threads.net/v1.0 */
export function threadsGraphBase(version: string = THREADS_GRAPH_VERSION): string {
  return `https://graph.threads.net/${version}`;
}

/** Token endpoints hang off the host with no version prefix. */
export const THREADS_GRAPH_HOST = "https://graph.threads.net";

/** OAuth authorize dialog — hosted on threads.net, NOT facebook.com. */
export const THREADS_OAUTH_AUTHORIZE = "https://threads.net/oauth/authorize";

/** Minimal scopes for read-profile + publish. */
export const THREADS_SCOPES: readonly string[] = [
  "threads_basic",
  "threads_content_publish",
];

// ─── OAuth ───────────────────────────────────────────────────────────────────

/** Build the OAuth authorize URL. `state` is echoed back on the callback. */
export function buildThreadsAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: readonly string[];
}): string {
  const p = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: (params.scopes ?? THREADS_SCOPES).join(","),
    state: params.state,
  });
  return `${THREADS_OAUTH_AUTHORIZE}?${p.toString()}`;
}

/**
 * Exchange the OAuth `code` for a SHORT-lived token. Unlike Facebook, Threads
 * returns the user id right in the token response, so no separate lookup is
 * needed to key the connection.
 */
export function buildThreadsTokenExchangeRequest(params: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): GraphRequest {
  const body = new URLSearchParams();
  body.set("client_id", params.clientId);
  body.set("client_secret", params.clientSecret);
  body.set("grant_type", "authorization_code");
  body.set("redirect_uri", params.redirectUri);
  body.set("code", params.code);
  return { url: `${THREADS_GRAPH_HOST}/oauth/access_token`, body };
}

export function parseThreadsTokenExchangeResponse(
  status: number,
  json: unknown,
):
  | { ok: true; accessToken: string; userId: string }
  | { ok: false; error: string } {
  const b = (json ?? {}) as {
    access_token?: string;
    user_id?: string | number;
    error_message?: string;
    error?: { message?: string };
  };
  if (status >= 200 && status < 300 && b.access_token && b.user_id != null) {
    return { ok: true, accessToken: b.access_token, userId: String(b.user_id) };
  }
  return {
    ok: false,
    error: b.error_message || b.error?.message || `HTTP ${status}`,
  };
}

/**
 * Upgrade a short-lived token to a LONG-lived one (~60 days). GET request, so
 * we return the URL rather than a GraphRequest (which models a POST body).
 */
export function buildThreadsLongLivedTokenUrl(params: {
  clientSecret: string;
  shortLivedToken: string;
}): string {
  const p = new URLSearchParams({
    grant_type: "th_exchange_token",
    client_secret: params.clientSecret,
    access_token: params.shortLivedToken,
  });
  return `${THREADS_GRAPH_HOST}/access_token?${p.toString()}`;
}

export function parseThreadsLongLivedTokenResponse(
  status: number,
  json: unknown,
):
  | { ok: true; accessToken: string; expiresIn: number }
  | { ok: false; error: string } {
  const b = (json ?? {}) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (status >= 200 && status < 300 && b.access_token) {
    return {
      ok: true,
      accessToken: b.access_token,
      expiresIn: b.expires_in ?? 60 * 24 * 60 * 60, // default 60 days
    };
  }
  return { ok: false, error: b.error?.message || `HTTP ${status}` };
}

// ─── Publish (two-step container -> publish) ─────────────────────────────────

/**
 * Step 1 of 2: create a media container. For a text post: media_type=TEXT +
 * text. For an image post: media_type=IMAGE + image_url (+ text as caption).
 * When an image is attached Threads downloads it during this call, so the URL
 * must be PUBLICLY reachable at that moment (a signed URL is fine, unexpired).
 *
 * `text` is required — Threads rejects an empty container.
 */
export function buildThreadsContainerRequest(params: {
  userId: string;
  accessToken: string;
  text: string;
  imageUrl?: string | null;
  graphBase?: string;
}): GraphRequest {
  const base = params.graphBase ?? threadsGraphBase();
  const body = new URLSearchParams();
  body.set("access_token", params.accessToken);
  body.set("text", params.text);
  if (params.imageUrl) {
    body.set("media_type", "IMAGE");
    body.set("image_url", params.imageUrl);
  } else {
    body.set("media_type", "TEXT");
  }
  return { url: `${base}/${params.userId}/threads`, body };
}

/** Step 2 of 2: promote the container to a live post. */
export function buildThreadsPublishRequest(params: {
  userId: string;
  accessToken: string;
  containerId: string;
  graphBase?: string;
}): GraphRequest {
  const base = params.graphBase ?? threadsGraphBase();
  const body = new URLSearchParams();
  body.set("creation_id", params.containerId);
  body.set("access_token", params.accessToken);
  return { url: `${base}/${params.userId}/threads_publish`, body };
}

/** Container creation -> the id needed for step 2. */
export function parseThreadsContainerResponse(
  status: number,
  json: unknown,
):
  | { ok: true; containerId: string }
  | { ok: false; error: string; retryable: boolean } {
  const b = (json ?? {}) as { id?: string; error?: GraphError };
  if (status >= 200 && status < 300 && b.id) {
    return { ok: true, containerId: b.id };
  }
  return {
    ok: false,
    error: `Threads media container failed: ${graphErrorMessage(b.error, status)}`,
    retryable: isRetryableGraphError(b.error, status),
  };
}

export function parseThreadsPublishResponse(
  status: number,
  json: unknown,
): MetaPublishOutcome {
  const b = (json ?? {}) as { id?: string; error?: GraphError };
  if (status >= 200 && status < 300 && b.id) {
    // The public permalink needs a follow-up lookup; the app does that
    // best-effort since the post is already live by this point.
    return { ok: true, postId: b.id, postUrl: null };
  }
  return {
    ok: false,
    error: `Threads publish failed: ${graphErrorMessage(b.error, status)}`,
    retryable: isRetryableGraphError(b.error, status),
    code: b.error?.code,
  };
}

/**
 * Between creating a container and publishing it, Threads processes the
 * container ASYNCHRONOUSLY. Publishing too early fails with "The media with id
 * … cannot be found" — and this bites even for TEXT-only posts, which is
 * surprising enough that it cost us a live debugging round. Poll this until
 * the state is "ready", then publish.
 */
export function buildThreadsContainerStatusUrl(params: {
  containerId: string;
  accessToken: string;
  graphBase?: string;
}): string {
  const base = params.graphBase ?? threadsGraphBase();
  return `${base}/${params.containerId}?fields=status,error_message&access_token=${encodeURIComponent(
    params.accessToken,
  )}`;
}

export type ThreadsContainerState =
  | { state: "ready" }
  | { state: "processing" }
  | { state: "failed"; error: string };

/**
 * Interpret a container status reply.
 *
 * A non-2xx or an unrecognized status is treated as "processing" rather than a
 * failure: the container was created successfully, so a transient read error
 * should keep us polling instead of throwing away a post that is about to be
 * publishable. Only ERROR/EXPIRED are terminal.
 */
export function parseThreadsContainerStatusResponse(
  status: number,
  json: unknown,
): ThreadsContainerState {
  const b = (json ?? {}) as {
    status?: string;
    error_message?: string;
    error?: GraphError;
  };
  if (status < 200 || status >= 300) return { state: "processing" };
  switch (b.status) {
    case "FINISHED":
    case "PUBLISHED":
      return { state: "ready" };
    case "ERROR":
    case "EXPIRED":
      return {
        state: "failed",
        error: `Threads container ${b.status.toLowerCase()}: ${
          b.error_message || "processing failed"
        }`,
      };
    default:
      return { state: "processing" };
  }
}

/** Best-effort permalink lookup URL: GET /{media-id}?fields=permalink. */
export function buildThreadsPermalinkUrl(params: {
  mediaId: string;
  accessToken: string;
  graphBase?: string;
}): string {
  const base = params.graphBase ?? threadsGraphBase();
  return `${base}/${params.mediaId}?fields=permalink&access_token=${encodeURIComponent(
    params.accessToken,
  )}`;
}
