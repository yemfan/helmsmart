import "server-only";
import crypto from "node:crypto";

/**
 * LinkedIn OAuth helpers — same shape as `meta-oauth.ts` but for the
 * Share API (the `w_member_social` scope, NOT the approval-gated
 * Marketing API). Lets agents post to their personal LinkedIn feed
 * on demand or via the scheduled-post cron.
 *
 * Flow:
 *   1. /start: generateAuthorizeUrl() — redirect to LinkedIn OAuth
 *   2. user grants on linkedin.com
 *   3. /callback: exchangeCodeForToken() → access_token + ~60d expiry
 *   4. /callback: fetchUserInfo() → { sub (URN), name, email }
 *   5. /callback: upsert into social_accounts with platform='linkedin'
 *
 * Scopes:
 *   - openid: OIDC baseline (required for userinfo endpoint)
 *   - profile: name + picture
 *   - email: email address
 *   - w_member_social: post on member's behalf
 *
 * None of these need partner-program approval — any developer app
 * can request them.
 */

export const LINKEDIN_API_BASE = "https://api.linkedin.com";
export const LINKEDIN_OAUTH_BASE = "https://www.linkedin.com/oauth/v2";

export const LINKEDIN_OAUTH_SCOPES = [
  "openid",
  "profile",
  "email",
  "w_member_social",
] as const;

function clientId(): string {
  const v = process.env.LINKEDIN_CLIENT_ID?.trim();
  if (!v) throw new Error("LINKEDIN_CLIENT_ID is not configured");
  return v;
}

function clientSecret(): string {
  const v = process.env.LINKEDIN_CLIENT_SECRET?.trim();
  if (!v) throw new Error("LINKEDIN_CLIENT_SECRET is not configured");
  return v;
}

/**
 * Production redirect URI. Must match the redirect URL configured
 * on the LinkedIn developer app dashboard exactly.
 */
export function redirectUri(): string {
  const v = process.env.LINKEDIN_OAUTH_REDIRECT_URI?.trim();
  if (v) return v;
  return "https://www.closebossai.com/api/leads-gen/connect/linkedin/callback";
}

/**
 * Build the OAuth authorize URL. `state` is echoed back unchanged
 * on the callback for the CSRF + agent-binding check.
 */
export function generateAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    redirect_uri: redirectUri(),
    state,
    scope: LINKEDIN_OAUTH_SCOPES.join(" "),
  });
  return `${LINKEDIN_OAUTH_BASE}/authorization?${params.toString()}`;
}

// ── State signing (identical pattern to meta-oauth) ─────────────────

export type StatePayload = {
  nonce: string;
  agentId: string;
  issuedAt: number;
  /** Mobile deep-link the callback should redirect to. Must start
   *  with `leadsmart://`. When set, the callback skips the cookie
   *  cross-check (in-app browsers don't carry the /start cookie
   *  because mobile uses POST /api/mobile/.../init instead of GET
   *  /start). Same pattern as meta-oauth. */
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
  const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
  if (!parsed.nonce || !parsed.agentId || !parsed.issuedAt) {
    throw new Error("State payload missing fields");
  }
  if (Date.now() - parsed.issuedAt > maxAgeMs) {
    throw new Error("State token expired");
  }
  return parsed;
}

// ── Token exchange ───────────────────────────────────────────────────

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

/**
 * Exchange the OAuth `code` for an access token. LinkedIn returns
 * tokens valid for ~60 days; we store the expiry on social_accounts
 * so the connect UI can warn agents before re-auth is needed.
 */
export async function exchangeCodeForToken(
  code: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    client_id: clientId(),
    client_secret: clientSecret(),
  });
  const res = await fetch(`${LINKEDIN_OAUTH_BASE}/accessToken`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) {
    const msg = json.error_description || json.error || `HTTP ${res.status}`;
    throw new Error(`LinkedIn token exchange failed: ${msg}`);
  }
  return {
    accessToken: json.access_token,
    expiresIn: json.expires_in ?? 60 * 24 * 60 * 60, // default to 60 days if missing
  };
}

// ── Userinfo (OIDC) ──────────────────────────────────────────────────

export type LinkedInUserInfo = {
  /** Personal URN — used as the `author` field on Share API posts: urn:li:person:<sub> */
  memberUrn: string;
  /** Plain id from OIDC `sub` claim. */
  memberId: string;
  name: string | null;
  givenName: string | null;
  familyName: string | null;
  email: string | null;
  pictureUrl: string | null;
};

type OidcUserInfoResponse = {
  sub?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  picture?: string;
  error?: { message?: string };
};

/**
 * Fetch the user's basic profile via the OIDC userinfo endpoint.
 * Returns the member URN we'll need as the post `author`.
 *
 * The `sub` claim from LinkedIn's OIDC endpoint is the member id
 * (a stable identifier). We construct the URN by prefixing with
 * `urn:li:person:` per LinkedIn's URN convention.
 */
export async function fetchUserInfo(
  accessToken: string,
): Promise<LinkedInUserInfo> {
  const res = await fetch(`${LINKEDIN_API_BASE}/v2/userinfo`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json().catch(() => ({}))) as OidcUserInfoResponse;
  if (!res.ok || !json.sub) {
    const msg = json.error?.message || `HTTP ${res.status}`;
    throw new Error(`LinkedIn userinfo failed: ${msg}`);
  }
  return {
    memberUrn: `urn:li:person:${json.sub}`,
    memberId: json.sub,
    name: json.name ?? null,
    givenName: json.given_name ?? null,
    familyName: json.family_name ?? null,
    email: json.email ?? null,
    pictureUrl: json.picture ?? null,
  };
}
