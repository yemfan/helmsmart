import "server-only";
import crypto from "node:crypto";

/**
 * TikTok OAuth (Login Kit) + identity helpers — same shape as pinterest-oauth /
 * threads-oauth (a standalone, non-`meta` platform with its own grant + one token
 * per account). Fetch-only, ported from the MarketingBoss client.
 *
 * Flow:
 *   1. /start: generateAuthorizeUrl() → redirect to the TikTok consent screen
 *   2. user grants on tiktok.com
 *   3. /callback: exchangeCodeForToken() → access + refresh token (+ open_id)
 *   4. /callback: fetchUserInfo() → { displayName, avatarUrl, username }
 *   5. /callback: upsert one social_accounts row with platform='tiktok'
 *
 * Publishing (video.publish/upload) lives in publish.ts. Direct Post to a PUBLIC
 * audience requires an audited app; unaudited apps post SELF_ONLY (see publish).
 *
 * Server-only secrets (one platform-level TikTok app, shared by all agents):
 *   TIKTOK_CLIENT_KEY
 *   TIKTOK_CLIENT_SECRET
 *   TIKTOK_OAUTH_REDIRECT_URI (optional; defaults to the www.closebossai.com callback)
 */

const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const USERINFO_URL = "https://open.tiktokapis.com/v2/user/info/";

export const TIKTOK_OAUTH_SCOPES = ["user.info.basic", "video.publish", "video.upload"] as const;

function clientKey(): string {
  // Trim: a stray newline/space makes TikTok reject the request with a bare
  // "client_key" error (same class of bug as an untrimmed META_APP_SECRET).
  const v = process.env.TIKTOK_CLIENT_KEY?.trim();
  if (!v) throw new Error("TIKTOK_CLIENT_KEY is not configured");
  return v;
}

function clientSecret(): string {
  const v = process.env.TIKTOK_CLIENT_SECRET?.trim();
  if (!v) throw new Error("TIKTOK_CLIENT_SECRET is not configured");
  return v;
}

export function tiktokConfigured(): boolean {
  return Boolean(process.env.TIKTOK_CLIENT_KEY?.trim() && process.env.TIKTOK_CLIENT_SECRET?.trim());
}

/** Must EXACTLY match a redirect URI configured on the TikTok app. */
export function redirectUri(): string {
  const v = process.env.TIKTOK_OAUTH_REDIRECT_URI?.trim();
  if (v) return v;
  return "https://www.closebossai.com/api/leads-gen/connect/tiktok/callback";
}

export function generateAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_key: clientKey(),
    scope: TIKTOK_OAUTH_SCOPES.join(","),
    response_type: "code",
    redirect_uri: redirectUri(),
    state,
    // Always show the consent screen. Without this, TikTok silently reuses a
    // prior grant — and if that grant was missing a scope (partial toggles),
    // every reconnect loops on "did not authorize the scope" with no way for
    // the user to fix it from the web (revoke lives in the mobile app only).
    disable_auto_auth: "1",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

// ── State signing (identical pattern to pinterest/threads) ───────────────────

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

// ── Token exchange / refresh ─────────────────────────────────────────────────

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number; // seconds (~24h)
  open_id?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(body: URLSearchParams): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  openId: string | null;
}> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) {
    const msg = json.error_description || json.error || `HTTP ${res.status}`;
    throw new Error(`TikTok token request failed: ${msg}`);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresIn: json.expires_in ?? 24 * 60 * 60,
    openId: json.open_id ?? null,
  };
}

export async function exchangeCodeForToken(code: string) {
  return tokenRequest(
    new URLSearchParams({
      client_key: clientKey(),
      client_secret: clientSecret(),
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(),
    }),
  );
}

export async function refreshAccessToken(refreshToken: string) {
  return tokenRequest(
    new URLSearchParams({
      client_key: clientKey(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
}

// ── Profile ──────────────────────────────────────────────────────────────────

export type TikTokUser = {
  openId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  username: string | null;
};

/** Read the connected account's basic profile (for the connection card). */
export async function fetchUserInfo(accessToken: string): Promise<TikTokUser> {
  const url = `${USERINFO_URL}?fields=open_id,display_name,avatar_url,username`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { user?: { open_id?: string; display_name?: string; avatar_url?: string; username?: string } };
    error?: { message?: string; code?: string };
  };
  if (!res.ok || json.error?.code === "access_token_invalid") {
    throw new Error(json.error?.message || `TikTok profile lookup failed (${res.status}).`);
  }
  const u = json.data?.user ?? {};
  return {
    openId: u.open_id ?? null,
    displayName: u.display_name ?? null,
    avatarUrl: u.avatar_url ?? null,
    username: u.username ?? null,
  };
}
