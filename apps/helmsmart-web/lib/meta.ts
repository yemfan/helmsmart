/**
 * Meta (Facebook + Instagram) integration — OAuth, connection storage, publish.
 *
 * Mirrors lib/linkedin.ts: per-org credentials in `org_oauth_tokens`
 * (provider='meta'), token stored ENCRYPTED via lib/crypto.ts. The Page id /
 * name / IG user id ride in `metadata` (migration 00079) because they are
 * public identifiers, not secrets.
 *
 * The Graph knowledge — which endpoint, the Instagram two-step container dance,
 * post-URL formats, which errors are worth retrying — lives in
 * @helm/dna-marketing. This file is the wiring: fetch, tokens, and our table.
 *
 * IMPORTANT: we store a PAGE access token, not a user token. Page tokens come
 * from /me/accounts during OAuth; publishing with a user token fails in a way
 * Meta's error message does not make obvious.
 */
import {
  buildFacebookPostRequest,
  buildInstagramContainerRequest,
  buildInstagramPublishRequest,
  instagramNeedsImage,
  metaGraphBase,
  metaOAuthDialog,
  parseFacebookPostResponse,
  parseInstagramContainerResponse,
  parseInstagramPublishResponse,
  META_GRAPH_VERSION,
} from "@helm/dna-marketing";

import { createServiceClient } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/crypto";

/**
 * pages_manage_posts + pages_read_engagement cover Page publishing;
 * instagram_basic + instagram_content_publish cover IG. All four need Advanced
 * Access (App Review) to work for OTHER people's Pages — but Standard Access is
 * enough for Pages owned by someone with a role on the app, which is how the
 * first org (ours) can publish before review completes.
 */
export const META_SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_content_publish",
].join(",");

const GRAPH_VERSION = process.env.META_GRAPH_VERSION?.trim() || META_GRAPH_VERSION;
const GRAPH = metaGraphBase(GRAPH_VERSION);

/**
 * @param requestHost the Host header of the CURRENT request, when available.
 *
 * The host matters because verticals are host-routed (www.helmsmart.ai,
 * doctor.helmsmart.ai — see lib/pack-host.ts). A fixed redirect URI breaks OAuth
 * on every pack subdomain in a way that looks like a CSRF failure rather than a
 * config problem: the state cookie is set on doctor.*, Meta returns the user to
 * www.*, that host never sees the cookie, and the callback reports bad_state.
 *
 * So the redirect is derived from the host the user is actually on. Meta
 * requires the redirect_uri to match EXACTLY between the authorize call and the
 * token exchange, which is why both paths must resolve it the same way — hence
 * one function rather than two constants.
 *
 * META_OAUTH_REDIRECT_URI still wins when set, as a single-domain escape hatch.
 */
export function getMetaConfig(requestHost?: string | null) {
  // Trim: a secret pasted into the Vercel dashboard with a trailing space or
  // newline still passes the presence check in isMetaConfigured(), then fails
  // the token exchange with an opaque OAuthException — an afternoon to diagnose.
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();

  const envBase = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002";
  const baseUrl = requestHost
    ? `${requestHost.startsWith("localhost") ? "http" : "https"}://${requestHost}`
    : envBase;

  const redirectUri =
    process.env.META_OAUTH_REDIRECT_URI || `${baseUrl}/api/auth/meta/callback`;
  return { appId, appSecret, baseUrl, redirectUri };
}

export function isMetaConfigured(): boolean {
  const { appId, appSecret } = getMetaConfig();
  return !!(appId && appSecret);
}

export function metaAuthUrl(state: string, requestHost?: string | null): string {
  const { appId, redirectUri } = getMetaConfig(requestHost);
  const q = new URLSearchParams({
    client_id: appId ?? "",
    redirect_uri: redirectUri,
    state,
    scope: META_SCOPES,
    response_type: "code",
  });
  return `${metaOAuthDialog(GRAPH_VERSION)}?${q.toString()}`;
}

// ─── OAuth ─────────────────────────────────────────────────────────────────────

/**
 * Exchange the OAuth code for a short-lived USER token.
 *
 * `requestHost` must produce the SAME redirect_uri the authorize call used —
 * Meta compares them exactly and rejects a mismatch.
 */
export async function exchangeMetaCode(
  code: string,
  requestHost?: string | null,
): Promise<string | null> {
  const { appId, appSecret, redirectUri } = getMetaConfig(requestHost);
  const q = new URLSearchParams({
    client_id: appId ?? "",
    client_secret: appSecret ?? "",
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch(`${GRAPH}/oauth/access_token?${q.toString()}`);
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: { message?: string; type?: string; code?: number };
  };
  if (res.ok && json.access_token) return json.access_token;
  // Log the Graph error itself — the callback only knows "it failed", and a bad
  // secret vs a redirect_uri mismatch vs an expired code all look identical from
  // there. Never logs the code or secret, only Meta's error envelope.
  console.error("[meta] token exchange failed:", res.status, json.error ?? json);
  return null;
}

export type MetaPage = {
  pageId: string;
  pageName: string;
  /** PAGE access token — this is what publishing needs. */
  pageAccessToken: string;
  igUserId: string | null;
};

/**
 * List the Pages this user administers, each with its own Page token and any
 * linked Instagram Business account.
 *
 * We ask for the IG link here rather than later because it is only reachable
 * through the Page, and discovering at publish time that IG was never linked is
 * a bad moment to find out.
 */
export async function fetchMetaPages(userAccessToken: string): Promise<MetaPage[]> {
  const q = new URLSearchParams({
    fields: "id,name,access_token,instagram_business_account{id}",
    access_token: userAccessToken,
  });
  const res = await fetch(`${GRAPH}/me/accounts?${q.toString()}`);
  const json = (await res.json().catch(() => ({}))) as {
    data?: Array<{
      id?: string;
      name?: string;
      access_token?: string;
      instagram_business_account?: { id?: string };
    }>;
    error?: { message?: string; type?: string; code?: number };
  };
  if (!res.ok || !Array.isArray(json.data)) {
    // A page moved into a Business portfolio can vanish from /me/accounts, and an
    // empty list here surfaces to the user as an opaque "no_pages_granted". Log
    // the shape (never tokens) so that case is distinguishable from a real error.
    console.error("[meta] fetchMetaPages: no usable pages", res.status, json.error ?? `data=${Array.isArray(json.data) ? json.data.length : "none"}`);
    return [];
  }
  // How many pages came back, and how many actually carried a token — a
  // business-owned page can appear with NO access_token, which the filter drops.
  console.error(
    "[meta] fetchMetaPages:",
    `pages=${json.data.length}`,
    `withToken=${json.data.filter((p) => p.access_token).length}`,
    `names=${json.data.map((p) => p.name).join("|")}`,
  );
  return json.data
    .filter((p) => p.id && p.access_token)
    .map((p) => ({
      pageId: p.id!,
      pageName: p.name ?? "Facebook Page",
      pageAccessToken: p.access_token!,
      igUserId: p.instagram_business_account?.id ?? null,
    }));
}

/**
 * Trade a short-lived Page token for a long-lived one (~60 days).
 *
 * Best-effort: if the exchange fails we keep the short-lived token rather than
 * failing the whole connect, because a connection that works for an hour is
 * still better than no connection and a confusing error.
 */
export async function extendMetaToken(shortLived: string): Promise<string> {
  const { appId, appSecret } = getMetaConfig();
  const q = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId ?? "",
    client_secret: appSecret ?? "",
    fb_exchange_token: shortLived,
  });
  try {
    const res = await fetch(`${GRAPH}/oauth/access_token?${q.toString()}`);
    const json = (await res.json().catch(() => ({}))) as { access_token?: string };
    return res.ok && json.access_token ? json.access_token : shortLived;
  } catch {
    return shortLived;
  }
}

// ─── Connection storage ────────────────────────────────────────────────────────

export type MetaConnection = {
  pageId: string;
  pageName: string;
  igUserId: string | null;
  pageAccessToken: string;
};

/** Persist the chosen Page. Token encrypted; ids in metadata (non-secret). */
export async function saveMetaConnection(orgId: string, page: MetaPage): Promise<void> {
  const db = await createServiceClient();
  const { error } = await db.from("org_oauth_tokens").upsert(
    {
      organization_id: orgId,
      provider: "meta",
      access_token: encrypt(page.pageAccessToken),
      token_type: "Bearer",
      scope: META_SCOPES,
      account_email: page.pageId, // mirrors the LinkedIn convention
      metadata: {
        page_id: page.pageId,
        page_name: page.pageName,
        ig_user_id: page.igUserId,
      },
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,provider" },
  );
  if (error) throw error;
}

/** Read + decrypt an org's Meta connection (service-role, so cron-safe). */
export async function getMetaConnection(orgId: string): Promise<MetaConnection | null> {
  const db = await createServiceClient();
  const { data } = await db
    .from("org_oauth_tokens")
    .select("access_token, account_email, metadata")
    .eq("organization_id", orgId)
    .eq("provider", "meta")
    .maybeSingle();

  const row = data as
    | {
        access_token?: string;
        account_email?: string;
        metadata?: { page_id?: string; page_name?: string; ig_user_id?: string | null };
      }
    | null;
  if (!row?.access_token) return null;

  let pageAccessToken: string;
  try {
    pageAccessToken = decrypt(row.access_token);
  } catch {
    return null; // key mismatch / corrupt — treat as not connected (reconnect)
  }

  const pageId = row.metadata?.page_id || row.account_email;
  if (!pageId) return null;

  return {
    pageId,
    pageName: row.metadata?.page_name || "Facebook Page",
    igUserId: row.metadata?.ig_user_id ?? null,
    pageAccessToken,
  };
}

// ─── Publishing ────────────────────────────────────────────────────────────────

export type PublishResult = {
  ok: boolean;
  id?: string;
  url?: string | null;
  error?: string;
  /** Whether a later retry could plausibly succeed. */
  retryable?: boolean;
};

/** Publish to the org's connected Facebook Page. */
export async function publishFacebookPost(
  orgId: string,
  content: string,
  imageUrl?: string | null,
): Promise<PublishResult> {
  const conn = await getMetaConnection(orgId);
  if (!conn) return { ok: false, error: "Facebook isn't connected yet.", retryable: false };

  const req = buildFacebookPostRequest({
    pageId: conn.pageId,
    pageAccessToken: conn.pageAccessToken,
    caption: content,
    imageUrl,
    graphBase: GRAPH,
  });

  try {
    const res = await fetch(req.url, { method: "POST", body: req.body });
    const json = await res.json().catch(() => ({}));
    const outcome = parseFacebookPostResponse(res.status, json);
    return outcome.ok
      ? { ok: true, id: outcome.postId, url: outcome.postUrl }
      : { ok: false, error: outcome.error, retryable: outcome.retryable };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Facebook request failed",
      retryable: true, // a network blip is worth another go
    };
  }
}

/**
 * Publish to the org's linked Instagram Business account.
 *
 * Two calls, in order: create a media container, then publish it. Instagram has
 * no text-only post, so a missing image is a permanent failure — retrying will
 * never help, and saying so stops the post cycling through the retry ladder.
 */
export async function publishInstagramPost(
  orgId: string,
  content: string,
  imageUrl?: string | null,
): Promise<PublishResult> {
  const conn = await getMetaConnection(orgId);
  if (!conn) return { ok: false, error: "Instagram isn't connected yet.", retryable: false };
  if (!conn.igUserId) {
    return {
      ok: false,
      error:
        "No Instagram Business account is linked to your Facebook Page. Link one in Meta Business Suite, then reconnect here.",
      retryable: false,
    };
  }
  if (instagramNeedsImage(imageUrl)) {
    return {
      ok: false,
      error: "Instagram posts need an image — text-only posts aren't supported by Instagram.",
      retryable: false,
    };
  }

  try {
    const containerReq = buildInstagramContainerRequest({
      igUserId: conn.igUserId,
      pageAccessToken: conn.pageAccessToken,
      caption: content,
      imageUrl: imageUrl!,
      graphBase: GRAPH,
    });
    const containerRes = await fetch(containerReq.url, {
      method: "POST",
      body: containerReq.body,
    });
    const container = parseInstagramContainerResponse(
      containerRes.status,
      await containerRes.json().catch(() => ({})),
    );
    if (!container.ok) return { ok: false, error: container.error, retryable: container.retryable };

    const publishReq = buildInstagramPublishRequest({
      igUserId: conn.igUserId,
      pageAccessToken: conn.pageAccessToken,
      containerId: container.containerId,
      graphBase: GRAPH,
    });
    const publishRes = await fetch(publishReq.url, { method: "POST", body: publishReq.body });
    const outcome = parseInstagramPublishResponse(
      publishRes.status,
      await publishRes.json().catch(() => ({})),
    );
    if (!outcome.ok) return { ok: false, error: outcome.error, retryable: outcome.retryable };

    // The post is live; the permalink is a nicety. Never fail on it.
    const url = await fetchInstagramPermalink(outcome.postId, conn.pageAccessToken);
    return { ok: true, id: outcome.postId, url };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Instagram request failed",
      retryable: true,
    };
  }
}

async function fetchInstagramPermalink(
  mediaId: string,
  token: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `${GRAPH}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(token)}`,
    );
    const json = (await res.json().catch(() => ({}))) as { permalink?: string };
    return res.ok && json.permalink ? json.permalink : null;
  } catch {
    return null;
  }
}
