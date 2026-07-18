import "server-only";
import crypto from "node:crypto";

/**
 * LinkedIn OAuth helpers — Share API (the `w_member_social` scope, NOT the
 * approval-gated Marketing API). Ported from apps/leadsmartai. Lets the
 * PropertyTools AI brand account connect its personal LinkedIn feed so the
 * brand auto-poster can publish.
 *
 * Flow:
 *   1. /start: generateAuthorizeUrl() — redirect to LinkedIn OAuth
 *   2. user grants on linkedin.com
 *   3. /callback: exchangeCodeForToken() → access_token + ~60d expiry
 *   4. /callback: fetchUserInfo() → { sub (URN), name, email }
 *   5. /callback: upsert into social_accounts with platform='linkedin'
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
 * Production redirect URI. Must match the redirect URL configured on the
 * LinkedIn developer app dashboard exactly. Prefer the explicit env var;
 * otherwise derive from the site origin. No hardcoded domain fallback so a
 * misconfigured env fails loudly instead of pointing at the wrong app.
 */
export function redirectUri(): string {
  const v = process.env.LINKEDIN_OAUTH_REDIRECT_URI?.trim();
  if (v) return v;
  const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (base) return `${base}/api/leads-gen/connect/linkedin/callback`;
  throw new Error("LINKEDIN_OAUTH_REDIRECT_URI is not configured");
}

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

// ── State signing ────────────────────────────────────────────────────

export type StatePayload = {
  nonce: string;
  agentId: string;
  issuedAt: number;
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

// ── Token exchange ───────────────────────────────────────────────────

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

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
    expiresIn: json.expires_in ?? 60 * 24 * 60 * 60,
  };
}

// ── Userinfo (OIDC) ──────────────────────────────────────────────────

export type LinkedInUserInfo = {
  memberUrn: string;
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

export async function fetchUserInfo(accessToken: string): Promise<LinkedInUserInfo> {
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
