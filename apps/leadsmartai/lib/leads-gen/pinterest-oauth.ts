import "server-only";
import crypto from "node:crypto";

import {
  PINTEREST_API_BASE,
  PINTEREST_OAUTH_AUTHORIZE,
  PINTEREST_OAUTH_TOKEN,
} from "@/lib/pinterest/graph";

/**
 * Pinterest OAuth helpers — same shape as `threads-oauth.ts` (a standalone,
 * non-`meta` platform with its own OAuth grant + one token per account).
 *
 * Flow:
 *   1. /start: generateAuthorizeUrl() — redirect to the Pinterest OAuth dialog
 *   2. user grants on pinterest.com
 *   3. /callback: exchangeCodeForToken() → access + refresh token (Basic auth)
 *   4. /callback: fetchProfile() → { username }
 *   5. /callback: fetchDefaultBoard() → { id, name } (a Pin needs a board)
 *   6. /callback: upsert one social_accounts row with platform='pinterest'
 *
 * Scopes (Pinterest requires the app to be granted these; trial mode covers the
 * app owner's own account, public rollout needs Pinterest review):
 *   - user_accounts:read — read the profile (username)
 *   - boards:read        — list boards to pick a default
 *   - boards:write       — REQUIRED to create a Pin. POST /v5/pins writes INTO
 *                          a board, so Pinterest bills it against the board
 *                          scope, not just pins:write. Omitting it publishes
 *                          nothing: every Pin comes back 403 with
 *                          "Missing: ['boards:write']" — which is exactly what
 *                          happened to every scheduled Pin before this was
 *                          added. Tokens minted without it must be re-granted;
 *                          scopes are fixed at authorize time.
 *   - pins:read / pins:write — create Pins on the user's behalf
 *
 * Tokens: access_token expires in ~30 days, refresh_token in ~1 year. We store
 * both, and `ensurePinterestAccessToken` (pinterest-post.ts) refreshes at the
 * point of use so a 30-day-old connection doesn't silently stop publishing.
 */

export const PINTEREST_OAUTH_SCOPES = [
  "user_accounts:read",
  "boards:read",
  "boards:write",
  "pins:read",
  "pins:write",
] as const;

function clientId(): string {
  const v = process.env.PINTEREST_APP_ID?.trim();
  if (!v) throw new Error("PINTEREST_APP_ID is not configured");
  return v;
}

function clientSecret(): string {
  const v = process.env.PINTEREST_APP_SECRET?.trim();
  if (!v) throw new Error("PINTEREST_APP_SECRET is not configured");
  return v;
}

/** Production redirect URI. Must match a Redirect URI configured on the
 *  Pinterest app dashboard exactly. */
export function redirectUri(): string {
  const v = process.env.PINTEREST_OAUTH_REDIRECT_URI?.trim();
  if (v) return v;
  return "https://www.closebossai.com/api/leads-gen/connect/pinterest/callback";
}

/** Build the OAuth authorize URL. `state` is echoed back on the callback for
 *  the CSRF + agent-binding check. */
export function generateAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: PINTEREST_OAUTH_SCOPES.join(","),
    state,
  });
  return `${PINTEREST_OAUTH_AUTHORIZE}?${params.toString()}`;
}

// ── State signing (identical pattern to threads-oauth) ───────────────────────

export type StatePayload = {
  nonce: string;
  agentId: string;
  issuedAt: number;
  /** Mobile deep-link the callback should redirect to (leadsmart://…). */
  returnTo?: string;
};

export function signState(payload: StatePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", clientSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string, maxAgeMs: number): StatePayload {
  const parts = state.split(".");
  if (parts.length !== 2) throw new Error("Malformed state token");
  const [body, sig] = parts as [string, string];
  const expected = crypto.createHmac("sha256", clientSecret()).update(body).digest("base64url");
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

// ── Token exchange ───────────────────────────────────────────────────────────

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number; // seconds (~30 days)
  refresh_token_expires_in?: number;
  scope?: string;
  message?: string;
  error?: string;
  error_description?: string;
};

/**
 * Exchange the OAuth `code` for an access token + refresh token. Pinterest v5
 * authenticates the token call with HTTP Basic (app_id:app_secret), not body
 * params.
 */
export type PinterestToken = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  /**
   * The scopes Pinterest actually GRANTED, parsed from the token response.
   * Null when Pinterest didn't say. Worth storing over the requested constant:
   * a scope the app isn't approved for is dropped from the grant silently, so
   * recording what we asked for makes the row claim a permission the token
   * doesn't have — which is why the missing `boards:write` was invisible in
   * `social_accounts.scopes` while every Pin failed on it.
   */
  grantedScopes: string[] | null;
};

export async function exchangeCodeForToken(code: string): Promise<PinterestToken> {
  const basic = Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
  });
  const res = await fetch(PINTEREST_OAUTH_TOKEN, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) {
    const msg = json.error_description || json.message || json.error || `HTTP ${res.status}`;
    throw new Error(`Pinterest token exchange failed: ${msg}`);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresIn: json.expires_in ?? 30 * 24 * 60 * 60, // default ~30 days
    grantedScopes: parseGrantedScopes(json.scope),
  };
}

/**
 * Exchange the stored refresh token for a fresh access token. Pinterest's
 * refresh grant keeps the ORIGINAL grant's scopes — it cannot add a new one,
 * so a connection minted before `boards:write` still needs a re-authorize.
 */
export async function refreshAccessToken(refreshToken: string): Promise<PinterestToken> {
  const basic = Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(PINTEREST_OAUTH_TOKEN, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) {
    const msg = json.error_description || json.message || json.error || `HTTP ${res.status}`;
    throw new Error(`Pinterest token refresh failed: ${msg}`);
  }
  return {
    accessToken: json.access_token,
    // Pinterest only returns a new refresh token when it rotates one; keep the
    // caller's existing token when it doesn't.
    refreshToken: json.refresh_token ?? null,
    expiresIn: json.expires_in ?? 30 * 24 * 60 * 60,
    grantedScopes: parseGrantedScopes(json.scope),
  };
}

/** Pinterest returns `scope` space- or comma-delimited depending on endpoint. */
function parseGrantedScopes(scope: string | undefined): string[] | null {
  if (!scope) return null;
  const parts = scope.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : null;
}

/**
 * Which of the scopes we need are absent from a granted list. Used to tell the
 * agent to reconnect BEFORE a Pin fails, rather than after 21 of them have.
 * A null/empty granted list means Pinterest didn't tell us — assume fine.
 */
export function missingPinterestScopes(granted: string[] | null | undefined): string[] {
  if (!granted || granted.length === 0) return [];
  const have = new Set(granted);
  return PINTEREST_OAUTH_SCOPES.filter((s) => !have.has(s));
}

// ── Profile + boards ─────────────────────────────────────────────────────────

export type PinterestProfile = {
  username: string | null;
  pictureUrl: string | null;
  businessName: string | null;
};

type UserAccountResponse = {
  username?: string;
  profile_image?: string;
  business_name?: string;
  account_type?: string;
  message?: string;
};

/** Fetch the connected Pinterest account's profile. `username` keys the row. */
export async function fetchProfile(accessToken: string): Promise<PinterestProfile> {
  const res = await fetch(`${PINTEREST_API_BASE}/user_account`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json().catch(() => ({}))) as UserAccountResponse;
  if (!res.ok || !json.username) {
    const msg = json.message || `HTTP ${res.status}`;
    throw new Error(`Pinterest profile lookup failed: ${msg}`);
  }
  return {
    username: json.username ?? null,
    pictureUrl: json.profile_image ?? null,
    businessName: json.business_name ?? null,
  };
}

export type PinterestBoard = { id: string; name: string };

type BoardsResponse = {
  items?: Array<{ id?: string; name?: string }>;
  message?: string;
};

/**
 * Fetch the account's boards and return the first one as the default target for
 * new Pins. Pins REQUIRE a board; a business account always has at least one. If
 * the account has none, connect fails with a clear message (they create a board
 * on Pinterest, then reconnect).
 */
export async function fetchDefaultBoard(accessToken: string): Promise<PinterestBoard> {
  const res = await fetch(`${PINTEREST_API_BASE}/boards?page_size=25`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json().catch(() => ({}))) as BoardsResponse;
  if (!res.ok) {
    const msg = json.message || `HTTP ${res.status}`;
    throw new Error(`Pinterest boards lookup failed: ${msg}`);
  }
  const first = (json.items ?? []).find((b) => b.id && b.name);
  if (!first?.id) {
    throw new Error(
      "This Pinterest account has no boards. Create a board on Pinterest, then reconnect.",
    );
  }
  return { id: String(first.id), name: String(first.name ?? "Board") };
}
