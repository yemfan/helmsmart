/**
 * Zero-dependency TikTok client (Login Kit OAuth + Content Posting API), fetch
 * only. Each user connects their own TikTok account; we publish their generated
 * videos via Direct Post (FILE_UPLOAD).
 *
 * Server-only secrets (one platform-level TikTok app, shared by all users):
 *   TIKTOK_CLIENT_KEY
 *   TIKTOK_CLIENT_SECRET
 *   TIKTOK_PRIVACY_LEVEL  (optional; default SELF_ONLY — public posting requires
 *                          your TikTok app to pass the Content Posting audit)
 *
 * Notes:
 *  - Access tokens expire in ~24h; refresh tokens last ~365 days. Refresh via
 *    getValidTikTokAccessToken() before publishing.
 *  - Direct Post to a PUBLIC audience requires an audited app. Unaudited apps can
 *    only post as SELF_ONLY (visible to the creator) for testing.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DbConnection } from "@/lib/social";

const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const PUBLISH_INIT = "https://open.tiktokapis.com/v2/post/publish/video/init/";
const SCOPES = ["user.info.basic", "video.publish", "video.upload"];

export type TikTokToken = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  open_id?: string;
  scope?: string;
};

export function tiktokConfigured(): boolean {
  return !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
}

function creds(): { key: string; secret: string } {
  const key = process.env.TIKTOK_CLIENT_KEY;
  const secret = process.env.TIKTOK_CLIENT_SECRET;
  if (!key || !secret) throw new Error("TikTok OAuth is not configured.");
  return { key, secret };
}

export function redirectUri(origin: string): string {
  // Match the shared social callback path + apex canonicalization.
  return `${origin.replace(/:\/\/www\./, "://")}/api/social/callback/tiktok`;
}

export function getAuthUrl(origin: string, state: string): string {
  const { key } = creds();
  const p = new URLSearchParams({
    client_key: key,
    scope: SCOPES.join(","),
    response_type: "code",
    redirect_uri: redirectUri(origin),
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

async function tokenRequest(body: URLSearchParams): Promise<TikTokToken> {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const d = (await r.json().catch(() => ({}))) as TikTokToken & { error?: string; error_description?: string };
  if (!r.ok || !d.access_token) throw new Error(d.error_description || d.error || "TikTok token request failed.");
  return d;
}

export async function exchangeCode(code: string, origin: string): Promise<TikTokToken> {
  const { key, secret } = creds();
  return tokenRequest(
    new URLSearchParams({
      client_key: key,
      client_secret: secret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(origin),
    }),
  );
}

export async function refreshAccessToken(refreshToken: string): Promise<TikTokToken> {
  const { key, secret } = creds();
  return tokenRequest(
    new URLSearchParams({
      client_key: key,
      client_secret: secret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
}

/**
 * A currently-valid TikTok access token for a connection, refreshing (and
 * persisting) when within 60s of expiry. TikTok-specific (its refresh endpoint
 * differs from Google's), so it lives here rather than in social.ts.
 */
export async function getValidTikTokAccessToken(userId: string, conn: DbConnection): Promise<string> {
  const expiresAt = conn.token_expires_at ? Date.parse(conn.token_expires_at) : 0;
  if (expiresAt && expiresAt - Date.now() > 60_000) return conn.access_token;
  if (!conn.refresh_token) return conn.access_token;

  const t = await refreshAccessToken(conn.refresh_token);
  const admin = createAdminClient();
  await admin
    .from("social_connections")
    .update({
      access_token: t.access_token,
      refresh_token: t.refresh_token ?? conn.refresh_token,
      token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("platform", "tiktok");
  return t.access_token;
}

/**
 * Publish a video via Direct Post: init (FILE_UPLOAD, single chunk) → PUT the
 * bytes to the returned upload_url. Returns the publish id (TikTok processes the
 * video asynchronously; there's no immediate public URL).
 */
export async function publishVideo(
  accessToken: string,
  opts: { bytes: Uint8Array<ArrayBuffer>; title: string },
): Promise<string> {
  const size = opts.bytes.length;
  const privacy = process.env.TIKTOK_PRIVACY_LEVEL || "SELF_ONLY";

  const initRes = await fetch(PUBLISH_INIT, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      post_info: {
        title: opts.title.slice(0, 2200),
        privacy_level: privacy,
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: size, total_chunk_count: 1 },
    }),
  });
  const init = (await initRes.json().catch(() => ({}))) as {
    data?: { publish_id?: string; upload_url?: string };
    error?: { code?: string; message?: string };
  };
  if (!initRes.ok || init.error?.code !== "ok" || !init.data?.upload_url || !init.data?.publish_id) {
    throw new Error(init.error?.message || `TikTok init failed (${initRes.status}).`);
  }

  const put = await fetch(init.data.upload_url, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
      "Content-Range": `bytes 0-${size - 1}/${size}`,
    },
    body: opts.bytes,
  });
  if (!put.ok) throw new Error(`TikTok upload failed (${put.status}).`);

  return init.data.publish_id;
}
