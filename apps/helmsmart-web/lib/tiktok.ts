/**
 * TikTok integration — OAuth connect (per-org token in `org_oauth_tokens`,
 * provider='tiktok'). Mirrors lib/linkedin.ts: org from the `helmsmart-org-id`
 * cookie, CSRF nonce in a cookie, access + refresh tokens stored ENCRYPTED
 * (lib/crypto.ts). The TikTok open_id is stashed in `account_email` (the generic
 * connected-account identifier), display fields in `metadata`.
 *
 * This is the CONNECT surface only. Publishing to TikTok needs video content
 * (TikTok is video-only) — wired when HelmSmart produces video (digital twin /
 * media), so tiktok is intentionally NOT yet in the publishable-platform union.
 */
import { encrypt } from "@/lib/crypto";

// user.info.basic to read the account; video.* so the same grant is publish-ready.
export const TIKTOK_SCOPES = ["user.info.basic", "video.publish", "video.upload"].join(",");
const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

export function getTikTokConfig() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002";
  const redirectUri = process.env.TIKTOK_OAUTH_REDIRECT_URI || `${baseUrl}/api/auth/tiktok/callback`;
  return { clientKey, clientSecret, redirectUri, baseUrl };
}

export function isTikTokConfigured(): boolean {
  const { clientKey, clientSecret } = getTikTokConfig();
  return !!(clientKey && clientSecret);
}

export function tiktokAuthorizeUrl(nonce: string): string {
  const { clientKey, redirectUri } = getTikTokConfig();
  const params = new URLSearchParams({
    client_key: clientKey!,
    scope: TIKTOK_SCOPES,
    response_type: "code",
    redirect_uri: redirectUri,
    state: nonce,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/** Exchange the OAuth code for tokens (access ~24h, refresh long-lived). */
export async function exchangeTikTokCode(
  code: string,
): Promise<{ accessToken: string; refreshToken: string | null; expiresIn: number; openId: string | null } | null> {
  const { clientKey, clientSecret, redirectUri } = getTikTokConfig();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey!,
      client_secret: clientSecret!,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    open_id?: string;
  };
  if (!res.ok || !json.access_token) return null;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresIn: json.expires_in ?? 24 * 60 * 60,
    openId: json.open_id ?? null,
  };
}

/** Read the connected account's display fields (best-effort). */
export async function fetchTikTokUser(
  accessToken: string,
): Promise<{ openId: string | null; displayName: string | null; username: string | null }> {
  try {
    const res = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: { user?: { open_id?: string; display_name?: string; username?: string } };
    };
    const u = json.data?.user;
    return { openId: u?.open_id ?? null, displayName: u?.display_name ?? null, username: u?.username ?? null };
  } catch {
    return { openId: null, displayName: null, username: null };
  }
}

/** Encrypt a token for storage (thin wrapper so callers don't import crypto). */
export function encryptTikTokToken(plaintext: string): string {
  return encrypt(plaintext);
}
