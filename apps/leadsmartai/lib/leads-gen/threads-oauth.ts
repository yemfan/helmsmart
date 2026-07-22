import "server-only";
import crypto from "node:crypto";

import {
  THREADS_GRAPH_BASE,
  THREADS_GRAPH_HOST,
  THREADS_OAUTH_AUTHORIZE,
} from "@/lib/threads/graph";

/**
 * Threads OAuth helpers — same shape as `linkedin-oauth.ts` (a standalone,
 * non-`meta` platform with its own OAuth grant + one token per account).
 * Threads is in the Meta family but authorizes SEPARATELY from Facebook/
 * Instagram: its own dialog on threads.net, its own token endpoints on
 * graph.threads.net, and its own App ID/Secret (the "Threads" app you add
 * under your Meta app's use cases).
 *
 * Flow:
 *   1. /start: generateAuthorizeUrl() — redirect to the Threads OAuth dialog
 *   2. user grants on threads.net
 *   3. /callback: exchangeCodeForToken() → short-lived token + threads user id
 *   4. /callback: exchangeForLongLivedToken() → ~60-day token
 *   5. /callback: fetchProfile() → { id, username } (id is the {user-id} in
 *      the publish endpoints)
 *   6. /callback: upsert one social_accounts row with platform='threads'
 *
 * Scopes:
 *   - threads_basic: read the profile (required baseline)
 *   - threads_content_publish: publish posts on the user's behalf
 *
 * Neither needs Meta App Review while the Threads account is a tester/dev on
 * the app; public rollout to other agents' accounts does.
 */

export const THREADS_OAUTH_SCOPES = [
  "threads_basic",
  "threads_content_publish",
] as const;

function clientId(): string {
  const v = process.env.THREADS_APP_ID?.trim();
  if (!v) throw new Error("THREADS_APP_ID is not configured");
  return v;
}

function clientSecret(): string {
  const v = process.env.THREADS_APP_SECRET?.trim();
  if (!v) throw new Error("THREADS_APP_SECRET is not configured");
  return v;
}

/**
 * Production redirect URI. Must match a Redirect Callback URL configured on the
 * Threads app dashboard exactly.
 */
export function redirectUri(): string {
  const v = process.env.THREADS_OAUTH_REDIRECT_URI?.trim();
  if (v) return v;
  return "https://www.closebossai.com/api/leads-gen/connect/threads/callback";
}

/** Build the OAuth authorize URL. `state` is echoed back unchanged on the
 *  callback for the CSRF + agent-binding check. */
export function generateAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: THREADS_OAUTH_SCOPES.join(","),
    state,
  });
  return `${THREADS_OAUTH_AUTHORIZE}?${params.toString()}`;
}

// ── State signing (identical pattern to linkedin-oauth / meta-oauth) ──────────

export type StatePayload = {
  nonce: string;
  agentId: string;
  issuedAt: number;
  /** Mobile deep-link the callback should redirect to. Must start with
   *  `leadsmart://`. When set, the callback skips the cookie cross-check. */
  returnTo?: string;
};

export function signState(payload: StatePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", clientSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string, maxAgeMs: number): StatePayload {
  const parts = state.split(".");
  if (parts.length !== 2) throw new Error("Malformed state token");
  const [body, sig] = parts as [string, string];
  const expected = crypto
    .createHmac("sha256", clientSecret())
    .update(body)
    .digest("base64url");
  const a = Buffer.from(sig, "base64url");
  const b = Buffer.from(expected, "base64url");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("State signature mismatch");
  }
  const parsed = JSON.parse(
    Buffer.from(body, "base64url").toString("utf8"),
  ) as StatePayload;
  if (!parsed.nonce || !parsed.agentId || !parsed.issuedAt) {
    throw new Error("State payload missing fields");
  }
  if (Date.now() - parsed.issuedAt > maxAgeMs) {
    throw new Error("State token expired");
  }
  return parsed;
}

// ── Token exchange ───────────────────────────────────────────────────────────

type ShortTokenResponse = {
  access_token?: string;
  user_id?: string | number;
  error_type?: string;
  error_message?: string;
  error?: { message?: string };
};

/**
 * Exchange the OAuth `code` for a SHORT-lived access token (~1h) + the Threads
 * user id. Unlike Facebook, Threads returns the user id right here in the token
 * response, so we don't need a separate lookup to key the row.
 */
export async function exchangeCodeForToken(
  code: string,
): Promise<{ accessToken: string; userId: string }> {
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: "authorization_code",
    redirect_uri: redirectUri(),
    code,
  });
  const res = await fetch(`${THREADS_GRAPH_HOST}/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as ShortTokenResponse;
  if (!res.ok || !json.access_token || json.user_id == null) {
    const msg =
      json.error_message || json.error?.message || `HTTP ${res.status}`;
    throw new Error(`Threads token exchange failed: ${msg}`);
  }
  return { accessToken: json.access_token, userId: String(json.user_id) };
}

type LongTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: { message?: string };
};

/**
 * Exchange a short-lived token for a LONG-lived one (~60 days). Long-lived
 * tokens can be refreshed before expiry, but we re-grant via OAuth when they
 * lapse (same policy as Meta/LinkedIn). Best-effort: on failure we fall back to
 * the short-lived token so a connect still succeeds.
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const params = new URLSearchParams({
    grant_type: "th_exchange_token",
    client_secret: clientSecret(),
    access_token: shortLivedToken,
  });
  const res = await fetch(`${THREADS_GRAPH_HOST}/access_token?${params}`, {
    method: "GET",
  });
  const json = (await res.json().catch(() => ({}))) as LongTokenResponse;
  if (!res.ok || !json.access_token) {
    const msg = json.error?.message || `HTTP ${res.status}`;
    throw new Error(`Threads long-lived token exchange failed: ${msg}`);
  }
  return {
    accessToken: json.access_token,
    expiresIn: json.expires_in ?? 60 * 24 * 60 * 60, // default 60 days
  };
}

// ── Profile ──────────────────────────────────────────────────────────────────

export type ThreadsProfile = {
  /** Threads user id — the {user-id} in the /threads publish endpoints. */
  userId: string;
  username: string | null;
  name: string | null;
  pictureUrl: string | null;
};

type MeResponse = {
  id?: string | number;
  username?: string;
  name?: string;
  threads_profile_picture_url?: string;
  error?: { message?: string };
};

/**
 * Fetch the connected Threads account's profile. `id` is authoritative — we
 * key the social_accounts row on it (the token response's user_id should match,
 * but /me is the canonical source).
 */
export async function fetchProfile(
  accessToken: string,
): Promise<ThreadsProfile> {
  const url =
    `${THREADS_GRAPH_BASE}/me` +
    `?fields=id,username,name,threads_profile_picture_url` +
    `&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as MeResponse;
  if (!res.ok || json.id == null) {
    const msg = json.error?.message || `HTTP ${res.status}`;
    throw new Error(`Threads profile lookup failed: ${msg}`);
  }
  return {
    userId: String(json.id),
    username: json.username ?? null,
    name: json.name ?? null,
    pictureUrl: json.threads_profile_picture_url ?? null,
  };
}
