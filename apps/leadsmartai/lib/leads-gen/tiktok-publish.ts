import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { decryptToken, encryptToken } from "./token-enc";
import { refreshAccessToken } from "./tiktok-oauth";

/**
 * TikTok Direct Post (Content Posting API) publisher. Ported from MarketingBoss.
 * Uploads the MP4 bytes via FILE_UPLOAD (single chunk); TikTok processes the
 * video asynchronously, so there's a publish_id but no immediate public URL.
 *
 * Access tokens live ~24h; ensureTikTokAccessToken refreshes (and persists) with
 * the stored refresh token before publishing.
 *
 * Direct Post to a PUBLIC audience requires an audited app. Unaudited apps must
 * post SELF_ONLY (default). Set TIKTOK_PRIVACY_LEVEL=PUBLIC_TO_EVERYONE once the
 * app passes TikTok's Content Posting audit.
 */

const PUBLISH_INIT = "https://open.tiktokapis.com/v2/post/publish/video/init/";

type TikTokConn = {
  id: string;
  user_access_token_enc: string | null;
  tiktok_refresh_token_enc: string | null;
  user_token_expires_at: string | null;
};

/** A currently-valid TikTok access token, refreshing within 2 min of expiry. */
export async function ensureTikTokAccessToken(conn: TikTokConn): Promise<string> {
  const current = conn.user_access_token_enc ? decryptToken(conn.user_access_token_enc) : "";
  const expMs = conn.user_token_expires_at ? Date.parse(conn.user_token_expires_at) : 0;
  if (current && expMs && expMs - Date.now() > 120_000) return current;
  if (!conn.tiktok_refresh_token_enc) {
    if (current) return current;
    throw new Error("TikTok token expired — reconnect TikTok.");
  }

  const t = await refreshAccessToken(decryptToken(conn.tiktok_refresh_token_enc));
  const nowIso = new Date().toISOString();
  await supabaseAdmin
    .from("social_accounts")
    .update({
      user_access_token_enc: encryptToken(t.accessToken),
      tiktok_refresh_token_enc: t.refreshToken ? encryptToken(t.refreshToken) : conn.tiktok_refresh_token_enc,
      user_token_expires_at: new Date(Date.now() + t.expiresIn * 1000).toISOString(),
      last_refreshed_at: nowIso,
      updated_at: nowIso,
    } as never)
    .eq("id", conn.id);
  return t.accessToken;
}

/** Publish a video via Direct Post (FILE_UPLOAD, single chunk). Returns publish_id. */
export async function publishTikTokVideo(
  accessToken: string,
  opts: { bytes: Uint8Array; title: string },
): Promise<{ externalPostId: string; externalPostUrl: string | null }> {
  const size = opts.bytes.length;
  const privacy = process.env.TIKTOK_PRIVACY_LEVEL?.trim() || "SELF_ONLY";

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
    body: opts.bytes as unknown as BodyInit,
  });
  if (!put.ok) throw new Error(`TikTok upload failed (${put.status}).`);

  // TikTok processes asynchronously — no immediate public URL.
  return { externalPostId: init.data.publish_id, externalPostUrl: null };
}
