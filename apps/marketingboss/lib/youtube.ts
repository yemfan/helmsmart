/**
 * Zero-dependency YouTube (Google OAuth + Data API) client — fetch only, no SDK.
 * Each user connects their OWN channel; we store their tokens and upload their
 * generated videos to it via videos.insert (multipart upload).
 *
 * Server-only secrets (one platform-level Google OAuth app, shared by all users):
 *   YOUTUBE_CLIENT_ID
 *   YOUTUBE_CLIENT_SECRET
 */
import "server-only";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
// upload lets us publish; readonly lets us read the channel name to show in the UI.
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

export function youtubeConfigured(): boolean {
  return !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET);
}

function creds(): { id: string; secret: string } {
  const id = process.env.YOUTUBE_CLIENT_ID;
  const secret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("YouTube OAuth is not configured.");
  return { id, secret };
}

export function redirectUri(origin: string): string {
  return `${origin}/api/youtube/callback`;
}

/** Consent-screen URL. `offline` + `prompt=consent` guarantees a refresh token. */
export function getAuthUrl(origin: string, state: string): string {
  const { id } = creds();
  const p = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

export async function exchangeCode(code: string, origin: string): Promise<TokenResponse> {
  const { id, secret } = creds();
  const body = new URLSearchParams({
    code,
    client_id: id,
    client_secret: secret,
    redirect_uri: redirectUri(origin),
    grant_type: "authorization_code",
  });
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const d = (await r.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!r.ok) throw new Error(d.error_description || d.error || "Token exchange failed.");
  return d;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const { id, secret } = creds();
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: id,
    client_secret: secret,
    grant_type: "refresh_token",
  });
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const d = (await r.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!r.ok) throw new Error(d.error_description || d.error || "Token refresh failed.");
  return d;
}

/** The authorizing user's channel (id + title), or null if they have none. */
export async function getChannel(
  accessToken: string,
): Promise<{ id: string; title: string | null } | null> {
  const r = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const d = (await r.json()) as {
    items?: { id: string; snippet?: { title?: string } }[];
    error?: { message?: string };
  };
  if (!r.ok) throw new Error(d.error?.message || "Could not read the YouTube channel.");
  const item = d.items?.[0];
  return item ? { id: item.id, title: item.snippet?.title ?? null } : null;
}

export type Privacy = "private" | "unlisted" | "public";

/** Upload a video (multipart) to the authorizing user's channel. Returns its id. */
export async function uploadVideo(
  accessToken: string,
  opts: {
    bytes: Uint8Array;
    contentType: string;
    title: string;
    description: string;
    privacy: Privacy;
  },
): Promise<string> {
  const metadata = {
    snippet: {
      title: opts.title.slice(0, 100) || "MarketingBoss video",
      description: opts.description.slice(0, 4900),
    },
    status: { privacyStatus: opts.privacy, selfDeclaredMadeForKids: false },
  };

  const boundary = `mkb${Math.floor(Math.random() * 1e16).toString(36)}`;
  const enc = new TextEncoder();
  const preamble = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${opts.contentType}\r\n\r\n`,
  );
  const epilogue = enc.encode(`\r\n--${boundary}--`);
  const body = new Blob([preamble, opts.bytes, epilogue]);

  const r = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  const d = (await r.json()) as { id?: string; error?: { message?: string } };
  if (!r.ok || !d.id) throw new Error(d.error?.message || `YouTube upload failed (${r.status}).`);
  return d.id;
}
