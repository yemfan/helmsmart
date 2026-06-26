import "server-only";
import crypto from "node:crypto";

/**
 * Meta OAuth helpers — keep all Meta-specific URL building, token
 * exchange, and Page enumeration in one place so route handlers
 * stay thin. The Graph API version is pinned here too.
 *
 * Flow (Phase 2A):
 *   1. /start: generateAuthorizeUrl() — redirect to FB OAuth dialog
 *   2. user grants on Facebook
 *   3. /callback: exchangeCodeForUserToken() → long-lived user token
 *   4. /callback: fetchPages() → list of {pageId, pageName, pageAccessToken, igBusinessUserId?}
 *   5. /callback: upsert one social_accounts row per Page
 *
 * Scopes are the union of what direct-posting (Phase 2A PR 2) and
 * Lead Ads (Phase 2B) will need. Requesting them all at once means
 * the agent grants once and we don't have to incrementally re-auth.
 * Advanced Access via App Review (see docs/meta-app-review.md)
 * is required before non-developer agents can grant these.
 */

export const META_GRAPH_VERSION = "v21.0";
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/**
 * Scopes requested at OAuth time. Order matters only for display in
 * the consent dialog — Meta groups them by API surface anyway.
 */
export const META_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_content_publish",
  // Phase 2B (Lead Ads) will request these too; keeping them in the
  // single grant means agents don't see a second OAuth dialog later.
  "ads_management",
  "ads_read",
  "leads_retrieval",
  "business_management",
] as const;

export type MetaScope = (typeof META_OAUTH_SCOPES)[number];

function appId(): string {
  const v = process.env.META_APP_ID?.trim();
  if (!v) throw new Error("META_APP_ID is not configured");
  return v;
}

function appSecret(): string {
  const v = process.env.META_APP_SECRET?.trim();
  if (!v) throw new Error("META_APP_SECRET is not configured");
  return v;
}

/**
 * Production redirect URI. Must match the Valid OAuth Redirect URIs
 * setting on the Meta App Dashboard exactly (Strict Mode is on).
 */
export function redirectUri(): string {
  const v = process.env.META_OAUTH_REDIRECT_URI?.trim();
  if (v) return v;
  // Sensible default for production so a missing env var doesn't
  // brick the connect button. Dev / preview environments still
  // need the env var since the actual hostname differs.
  return "https://www.realtybossai.com/api/leads-gen/connect/meta/callback";
}

/** Build the OAuth dialog URL. `state` is opaque to Meta — they echo
 *  it back unchanged on the callback for our CSRF check. */
export function generateAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: appId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: META_OAUTH_SCOPES.join(","),
    state,
    // Force the consent dialog every time so agents see exactly
    // which permissions they're granting — easier audit + fewer
    // "I didn't know I gave that" support tickets.
    auth_type: "rerequest",
  });
  return `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

/**
 * Cryptographically signed state token. We don't have sessions to
 * stash state in, so we make state self-verifying: base64 of
 * `{nonce, agentId, issuedAt, returnTo?}` + HMAC over it. Callback
 * verifies the HMAC + checks issuedAt is recent.
 *
 * `returnTo` is used for mobile OAuth: the mobile app passes a
 * deep-link URL (e.g. `leadsmart://leads-gen/connect/callback`)
 * which the callback redirects to instead of the web connect page.
 * The callback validates the scheme is mobile-only so a malicious
 * actor can't redirect to an arbitrary external URL.
 */
export type StatePayload = {
  nonce: string;
  agentId: string;
  issuedAt: number;
  /** Mobile deep-link the callback should redirect to. Must start with `leadsmart://`. */
  returnTo?: string;
};

export function signState(payload: StatePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", appSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string, maxAgeMs: number): StatePayload {
  const parts = state.split(".");
  if (parts.length !== 2) throw new Error("Malformed state token");
  const [body, sig] = parts;
  const expected = crypto
    .createHmac("sha256", appSecret())
    .update(body)
    .digest("base64url");
  const a = Buffer.from(sig, "base64url");
  const b = Buffer.from(expected, "base64url");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("State signature mismatch");
  }
  const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
  if (!parsed.nonce || !parsed.agentId || !parsed.issuedAt) {
    throw new Error("State payload missing fields");
  }
  if (Date.now() - parsed.issuedAt > maxAgeMs) {
    throw new Error("State token expired");
  }
  return parsed;
}

// ── Token exchange ───────────────────────────────────────────────────

type ShortLivedUserTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in?: number;
};

type LongLivedUserTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

/**
 * Exchange the code from /callback for a short-lived user token.
 * The endpoint returns ~1-2h tokens which we then exchange again
 * for ~60-day long-lived tokens.
 *
 * Always succeeds with a 200 — Meta returns errors as JSON with an
 * `error` object. Caller should check `access_token` is present.
 */
export async function exchangeCodeForShortLivedUserToken(
  code: string,
): Promise<{ accessToken: string; expiresIn: number | null }> {
  const params = new URLSearchParams({
    client_id: appId(),
    client_secret: appSecret(),
    redirect_uri: redirectUri(),
    code,
  });
  const res = await fetch(`${META_GRAPH_BASE}/oauth/access_token?${params}`, {
    method: "GET",
  });
  const body = (await res.json().catch(() => ({}))) as ShortLivedUserTokenResponse & {
    error?: { message?: string; type?: string; code?: number };
  };
  if (!res.ok || !body.access_token) {
    const msg = body.error?.message || `HTTP ${res.status}`;
    throw new Error(`Meta short-lived token exchange failed: ${msg}`);
  }
  return {
    accessToken: body.access_token,
    expiresIn: body.expires_in ?? null,
  };
}

/**
 * Exchange a short-lived user token for a long-lived one (~60 days).
 * Long-lived tokens can be re-exchanged to refresh, but we usually
 * just re-grant via OAuth when expiry approaches.
 */
export async function exchangeForLongLivedUserToken(
  shortLivedToken: string,
): Promise<{ accessToken: string; expiresIn: number | null }> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId(),
    client_secret: appSecret(),
    fb_exchange_token: shortLivedToken,
  });
  const res = await fetch(`${META_GRAPH_BASE}/oauth/access_token?${params}`, {
    method: "GET",
  });
  const body = (await res.json().catch(() => ({}))) as LongLivedUserTokenResponse & {
    error?: { message?: string };
  };
  if (!res.ok || !body.access_token) {
    const msg = body.error?.message || `HTTP ${res.status}`;
    throw new Error(`Meta long-lived token exchange failed: ${msg}`);
  }
  return {
    accessToken: body.access_token,
    expiresIn: body.expires_in ?? null,
  };
}

// ── Page enumeration + IG resolution ─────────────────────────────────

export type ConnectedPage = {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  picture: string | null;
  igBusinessUserId: string | null;
  igBusinessUsername: string | null;
};

type MetaMeAccountsResponse = {
  data?: Array<{
    id?: string;
    name?: string;
    access_token?: string;
    picture?: { data?: { url?: string } };
    instagram_business_account?: { id?: string };
  }>;
  paging?: { next?: string };
};

type MetaIgUserResponse = {
  id?: string;
  username?: string;
  error?: { message?: string };
};

/**
 * List the Pages a user manages, each with its Page access token
 * + linked IG Business account (if any).
 *
 * Pages with no IG Business linked get `igBusinessUserId: null` —
 * caller decides whether to skip them or store as Page-only.
 *
 * Paginates client-side — most agents have ≤ 5 Pages but a real
 * brokerage account can have dozens. We follow `paging.next`
 * until empty.
 */
export async function fetchPagesForUser(
  userAccessToken: string,
): Promise<ConnectedPage[]> {
  const pages: ConnectedPage[] = [];
  let url:
    | string
    | undefined = `${META_GRAPH_BASE}/me/accounts?fields=id,name,access_token,picture{url},instagram_business_account&access_token=${encodeURIComponent(userAccessToken)}`;
  while (url) {
    const res = await fetch(url);
    const body = (await res.json().catch(() => ({}))) as MetaMeAccountsResponse & {
      error?: { message?: string };
    };
    if (!res.ok) {
      const msg = body.error?.message || `HTTP ${res.status}`;
      throw new Error(`Meta /me/accounts failed: ${msg}`);
    }
    for (const row of body.data ?? []) {
      if (!row.id || !row.access_token) continue;
      const igId = row.instagram_business_account?.id ?? null;
      let igUsername: string | null = null;
      if (igId) {
        // Best-effort: fetch the IG username so the UI can show
        // "@somehandle" next to the Page name. Failure (e.g. token
        // missing IG scope) just leaves the username blank.
        try {
          const igRes = await fetch(
            `${META_GRAPH_BASE}/${igId}?fields=username&access_token=${encodeURIComponent(row.access_token)}`,
          );
          const igBody = (await igRes.json().catch(() => ({}))) as MetaIgUserResponse;
          if (igRes.ok && igBody.username) igUsername = igBody.username;
        } catch {
          // ignore
        }
      }
      pages.push({
        pageId: row.id,
        pageName: row.name ?? row.id,
        pageAccessToken: row.access_token,
        picture: row.picture?.data?.url ?? null,
        igBusinessUserId: igId,
        igBusinessUsername: igUsername,
      });
    }
    url = body.paging?.next;
  }
  return pages;
}
