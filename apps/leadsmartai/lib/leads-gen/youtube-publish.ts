import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { decryptToken, encryptToken } from "./token-enc";
import { refreshAccessToken } from "./youtube-oauth";

/**
 * YouTube (Data API v3) video publisher. Ported from MarketingBoss. Uploads the
 * MP4 bytes via a multipart videos.insert; returns the video id + youtu.be URL.
 * Vertical clips land as Shorts. Access tokens live ~1h; ensureYouTubeAccessToken
 * refreshes (and persists) with the stored refresh token before uploading.
 */

const UPLOAD_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status";

export type YouTubePrivacy = "private" | "unlisted" | "public";

type YouTubeConn = {
  id: string;
  user_access_token_enc: string | null;
  youtube_refresh_token_enc: string | null;
  user_token_expires_at: string | null;
};

/** A currently-valid access token, refreshing within 2 min of expiry. */
export async function ensureYouTubeAccessToken(conn: YouTubeConn): Promise<string> {
  const current = conn.user_access_token_enc ? decryptToken(conn.user_access_token_enc) : "";
  const expMs = conn.user_token_expires_at ? Date.parse(conn.user_token_expires_at) : 0;
  if (current && expMs && expMs - Date.now() > 120_000) return current;
  if (!conn.youtube_refresh_token_enc) {
    if (current) return current;
    throw new Error("YouTube token expired — reconnect YouTube.");
  }

  const t = await refreshAccessToken(decryptToken(conn.youtube_refresh_token_enc));
  const nowIso = new Date().toISOString();
  await supabaseAdmin
    .from("social_accounts")
    .update({
      user_access_token_enc: encryptToken(t.accessToken),
      // Google only returns a refresh token on first consent; keep the stored one otherwise.
      youtube_refresh_token_enc: t.refreshToken ? encryptToken(t.refreshToken) : conn.youtube_refresh_token_enc,
      user_token_expires_at: new Date(Date.now() + t.expiresIn * 1000).toISOString(),
      last_refreshed_at: nowIso,
      updated_at: nowIso,
    } as never)
    .eq("id", conn.id);
  return t.accessToken;
}

/** Upload a video (multipart) to the authorizing channel. Returns id + URL. */
export async function uploadYouTubeVideo(
  accessToken: string,
  opts: { bytes: Uint8Array; contentType: string; title: string; description: string; privacy: YouTubePrivacy },
): Promise<{ externalPostId: string; externalPostUrl: string | null }> {
  const metadata = {
    snippet: {
      title: opts.title.slice(0, 100) || "CloseBoss video",
      description: opts.description.slice(0, 4900),
    },
    status: { privacyStatus: opts.privacy, selfDeclaredMadeForKids: false },
  };

  // Vary the boundary token by content length (Math.random is unavailable here).
  const boundary = `cb${opts.bytes.length.toString(36)}${opts.title.length.toString(36)}`;
  const enc = new TextEncoder();
  const preamble = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${opts.contentType}\r\n\r\n`,
  );
  const epilogue = enc.encode(`\r\n--${boundary}--`);

  const body = new Uint8Array(preamble.length + opts.bytes.length + epilogue.length);
  body.set(preamble, 0);
  body.set(opts.bytes, preamble.length);
  body.set(epilogue, preamble.length + opts.bytes.length);

  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: body as unknown as BodyInit,
  });
  const d = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!res.ok || !d.id) throw new Error(d.error?.message || `YouTube upload failed (${res.status}).`);
  return { externalPostId: d.id, externalPostUrl: `https://youtu.be/${d.id}` };
}
