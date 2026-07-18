import "server-only";

import { META_GRAPH_BASE, META_OAUTH_DIALOG } from "@/lib/meta/graph";

/**
 * Facebook OAuth flow for the Auto-post-to-social feature.
 *
 * v1 wires the standard short-lived → long-lived token exchange + page
 * token enumeration. The agent connects their FB User account, we
 * enumerate the Pages they manage, persist a long-lived Page token per
 * page (no exchange to permanent — Meta deprecated permanent tokens
 * for Pages outside SystemUsers, the 60-day rolling token is the
 * standard).
 *
 * Required env:
 *   META_APP_ID            — Facebook app id
 *   META_APP_SECRET        — Facebook app secret
 *   META_OAUTH_REDIRECT_URI — fully qualified callback URL the FB app
 *                             allows (e.g. https://realtybossai.com
 *                             /api/social/facebook/callback)
 *
 * Without these env vars the helpers return clear "not configured"
 * errors so the schema + UI shells still ship.
 *
 * Scopes requested: pages_show_list (enumerate pages),
 * pages_manage_posts (create posts on the page's wall),
 * pages_read_engagement (basic page metadata for display).
 */

const REQUIRED_SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
];

// Graph version comes from the shared source of truth (lib/meta/graph.ts).
// This file used to pin v19.0 — released Jan 2024, so already past Meta's
// ~2-year deprecation window, while the publisher had moved on to v21.0.
const GRAPH_BASE = META_GRAPH_BASE;
const FB_DIALOG = META_OAUTH_DIALOG;

export type FacebookOauthConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
};

export type FacebookOauthConfigResult =
  | { ok: true; config: FacebookOauthConfig }
  | { ok: false; error: string };

/**
 * Narrowing predicate for the `tsconfig.strict:false` codebase — lets
 * callers access `.error` after a failure check.
 */
export function isFacebookOauthConfigFailure(
  r: FacebookOauthConfigResult,
): r is { ok: false; error: string } {
  return r.ok === false;
}

export function loadFacebookOauthConfig(): FacebookOauthConfigResult {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI?.trim();

  const missing: string[] = [];
  if (!appId) missing.push("META_APP_ID");
  if (!appSecret) missing.push("META_APP_SECRET");
  if (!redirectUri) missing.push("META_OAUTH_REDIRECT_URI");

  if (missing.length > 0 || !appId || !appSecret || !redirectUri) {
    return {
      ok: false,
      error: `Facebook OAuth is not configured (missing: ${missing.join(", ")})`,
    };
  }
  return { ok: true, config: { appId, appSecret, redirectUri } };
}

/**
 * Build the Facebook authorization URL the agent visits to grant
 * permissions. `state` is a random opaque string the callback verifies
 * to prevent CSRF; the caller stores it in a session cookie / DB.
 */
export function buildFacebookAuthorizeUrl(args: {
  appId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: args.appId,
    redirect_uri: args.redirectUri,
    state: args.state,
    response_type: "code",
    scope: REQUIRED_SCOPES.join(","),
  });
  return `${FB_DIALOG}?${params.toString()}`;
}

export type FacebookPage = {
  id: string;
  name: string;
  /** Long-lived page access token (60-day rolling). */
  accessToken: string;
  category: string | null;
};

/**
 * Exchange the OAuth code → user access token → list of pages the user
 * manages, each with its own page-scoped access token. Single function
 * because the three steps are tightly sequenced and never useful
 * standalone.
 */
export async function exchangeCodeForPages(args: {
  config: FacebookOauthConfig;
  code: string;
}): Promise<FacebookPage[]> {
  // Step 1: code → short-lived user access token.
  const tokenUrl = `${GRAPH_BASE}/oauth/access_token?${new URLSearchParams({
    client_id: args.config.appId,
    client_secret: args.config.appSecret,
    redirect_uri: args.config.redirectUri,
    code: args.code,
  }).toString()}`;

  const tokenRes = await fetch(tokenUrl, { cache: "no-store" });
  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => "");
    throw new Error(`Facebook token exchange failed (${tokenRes.status}): ${text || tokenRes.statusText}`);
  }
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  const userAccessToken = tokenJson.access_token;
  if (!userAccessToken) {
    throw new Error("Facebook token exchange returned no access_token");
  }

  // Step 2: short-lived → long-lived user token. Pages enumerated against
  // a long-lived user token themselves get long-lived page tokens.
  const longLivedUrl = `${GRAPH_BASE}/oauth/access_token?${new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: args.config.appId,
    client_secret: args.config.appSecret,
    fb_exchange_token: userAccessToken,
  }).toString()}`;

  const llRes = await fetch(longLivedUrl, { cache: "no-store" });
  if (!llRes.ok) {
    const text = await llRes.text().catch(() => "");
    throw new Error(`Facebook long-lived token exchange failed (${llRes.status}): ${text || llRes.statusText}`);
  }
  const llJson = (await llRes.json()) as { access_token?: string };
  const longLivedUserToken = llJson.access_token ?? userAccessToken;

  // Step 3: enumerate pages.
  const pagesUrl = `${GRAPH_BASE}/me/accounts?${new URLSearchParams({
    access_token: longLivedUserToken,
  }).toString()}`;
  const pagesRes = await fetch(pagesUrl, { cache: "no-store" });
  if (!pagesRes.ok) {
    const text = await pagesRes.text().catch(() => "");
    throw new Error(`Facebook page enumeration failed (${pagesRes.status}): ${text || pagesRes.statusText}`);
  }
  const pagesJson = (await pagesRes.json()) as {
    data?: Array<{ id: string; name?: string; access_token?: string; category?: string }>;
  };

  const pages = (pagesJson.data ?? [])
    .filter((p) => typeof p.id === "string" && typeof p.access_token === "string")
    .map<FacebookPage>((p) => ({
      id: String(p.id),
      name: p.name?.trim() || "Untitled Page",
      accessToken: String(p.access_token),
      category: p.category ?? null,
    }));
  return pages;
}

/**
 * Generate a random state token for CSRF protection on the OAuth
 * round-trip. Uses crypto.randomUUID so the value is opaque + uniform.
 */
export function generateOauthState(): string {
  // Node 19+ (we target 24 LTS) has crypto.randomUUID at the global.
  // Fallback to Math.random isn't safe for CSRF — throw if missing.
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("crypto.randomUUID is not available in this runtime");
  }
  return crypto.randomUUID();
}
