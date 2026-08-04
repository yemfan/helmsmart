/**
 * YouTube (Google) integration — OAuth connect (per-org token in
 * `org_oauth_tokens`, provider='youtube'). Mirrors lib/linkedin.ts: org from the
 * `helmsmart-org-id` cookie, CSRF nonce in a cookie, access + refresh tokens
 * stored ENCRYPTED (lib/crypto.ts). The channel id is stashed in `account_email`,
 * the channel title in `metadata`.
 *
 * CONNECT surface only. Publishing (uploads.insert) needs video content — wired
 * when HelmSmart produces video — so youtube is not yet a publishable platform.
 * `access_type=offline` + `prompt=consent` guarantee a refresh token.
 */
import { encrypt } from "@/lib/crypto";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export function getYouTubeConfig() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002";
  const redirectUri = process.env.YOUTUBE_OAUTH_REDIRECT_URI || `${baseUrl}/api/auth/youtube/callback`;
  return { clientId, clientSecret, redirectUri, baseUrl };
}

export function isYouTubeConfigured(): boolean {
  const { clientId, clientSecret } = getYouTubeConfig();
  return !!(clientId && clientSecret);
}

export function youtubeAuthorizeUrl(nonce: string): string {
  const { clientId, redirectUri } = getYouTubeConfig();
  const params = new URLSearchParams({
    client_id: clientId!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPES,
    state: nonce,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/** Exchange the OAuth code for tokens (access ~1h, refresh long-lived). */
export async function exchangeYouTubeCode(
  code: string,
): Promise<{ accessToken: string; refreshToken: string | null; expiresIn: number; scope: string | null } | null> {
  const { clientId, clientSecret, redirectUri } = getYouTubeConfig();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId!,
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
    scope?: string;
  };
  if (!res.ok || !json.access_token) return null;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresIn: json.expires_in ?? 3600,
    scope: json.scope ?? null,
  };
}

/** Read the connected channel (id + title), best-effort. */
export async function fetchYouTubeChannel(
  accessToken: string,
): Promise<{ id: string | null; title: string | null }> {
  try {
    const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = (await res.json().catch(() => ({}))) as {
      items?: { id?: string; snippet?: { title?: string } }[];
    };
    const ch = json.items?.[0];
    return { id: ch?.id ?? null, title: ch?.snippet?.title ?? null };
  } catch {
    return { id: null, title: null };
  }
}

/** Encrypt a token for storage (thin wrapper so callers don't import crypto). */
export function encryptYouTubeToken(plaintext: string): string {
  return encrypt(plaintext);
}
