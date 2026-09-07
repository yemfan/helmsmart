import "server-only";
import crypto from "node:crypto";

/**
 * YouTube (Google OAuth + Data API v3) OAuth helpers — same shape as
 * tiktok-oauth / pinterest-oauth. Fetch-only, ported from the MarketingBoss
 * client. Each agent connects their OWN channel; we upload their videos to it.
 *
 * Server-only secrets (one platform-level Google OAuth app, shared by all agents):
 *   YOUTUBE_CLIENT_ID
 *   YOUTUBE_CLIENT_SECRET
 *   YOUTUBE_OAUTH_REDIRECT_URI (optional; defaults to the www.closebossai.com callback)
 *
 * The youtube.upload scope is "sensitive" — production needs Google OAuth
 * verification; in testing mode the app owner + allow-listed testers can use it.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true";

export const YOUTUBE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
] as const;

function clientId(): string {
  const v = process.env.YOUTUBE_CLIENT_ID?.trim();
  if (!v) throw new Error("YOUTUBE_CLIENT_ID is not configured");
  return v;
}

function clientSecret(): string {
  const v = process.env.YOUTUBE_CLIENT_SECRET?.trim();
  if (!v) throw new Error("YOUTUBE_CLIENT_SECRET is not configured");
  return v;
}

export function youtubeConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_CLIENT_ID?.trim() && process.env.YOUTUBE_CLIENT_SECRET?.trim());
}

/** Must EXACTLY match an authorized redirect URI on the Google OAuth client. */
export function redirectUri(): string {
  const v = process.env.YOUTUBE_OAUTH_REDIRECT_URI?.trim();
  if (v) return v;
  return "https://www.closebossai.com/api/leads-gen/connect/youtube/callback";
}

/**
 * `offline` + `prompt=consent` guarantees a refresh token. The same client
 * and redirect serve Google Analytics (lib/leads-gen/google-analytics.ts)
 * with its own, narrower scopes; the state's `purpose` tells the callback
 * which flow is finishing.
 */
export function generateAuthorizeUrl(state: string, scopes: readonly string[] = YOUTUBE_OAUTH_SCOPES): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

// ── State signing (identical pattern to tiktok/pinterest) ────────────────────

export type StatePayload = {
  nonce: string;
  agentId: string;
  issuedAt: number;
  returnTo?: string;
  /** Which connection this authorisation is for. Absent = YouTube (the original flow). */
  purpose?: "youtube" | "analytics";
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
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(body: URLSearchParams): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scope: string | null;
}> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) {
    const msg = json.error_description || json.error || `HTTP ${res.status}`;
    throw new Error(`YouTube token request failed: ${msg}`);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresIn: json.expires_in ?? 3600,
    scope: json.scope ?? null,
  };
}

export async function exchangeCodeForToken(code: string) {
  return tokenRequest(
    new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  );
}

export async function refreshAccessToken(refreshToken: string) {
  return tokenRequest(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
    }),
  );
}

// ── Channel ──────────────────────────────────────────────────────────────────

export type YouTubeChannel = { id: string; title: string | null };

/** The authorizing user's channel (id + title), or null if they have none. */
export async function fetchChannel(accessToken: string): Promise<YouTubeChannel | null> {
  const res = await fetch(CHANNELS_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = (await res.json().catch(() => ({}))) as {
    items?: { id: string; snippet?: { title?: string } }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(json.error?.message || `Could not read the YouTube channel (${res.status}).`);
  const item = json.items?.[0];
  return item ? { id: item.id, title: item.snippet?.title ?? null } : null;
}
