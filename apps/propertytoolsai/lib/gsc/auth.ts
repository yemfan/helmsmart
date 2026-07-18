/**
 * Google Search Console OAuth (installed-app / refresh-token flow).
 *
 * The org blocks service-account keys, so we authenticate with a long-lived
 * OAuth refresh token and exchange it for short-lived access tokens on demand.
 * Env vars (set in Vercel):
 *   - GSC_OAUTH_CLIENT_ID
 *   - GSC_OAUTH_CLIENT_SECRET
 *   - GSC_OAUTH_REFRESH_TOKEN
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

// Cache the access token in module scope; refresh ~60s before it expires.
let cachedToken: string | null = null;
let cachedExpiresAt = 0; // epoch ms

export async function getGscAccessToken(): Promise<string> {
  const clientId = process.env.GSC_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GSC_OAUTH_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GSC_OAUTH_REFRESH_TOKEN?.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    const missing = [
      !clientId && "GSC_OAUTH_CLIENT_ID",
      !clientSecret && "GSC_OAUTH_CLIENT_SECRET",
      !refreshToken && "GSC_OAUTH_REFRESH_TOKEN",
    ].filter(Boolean);
    throw new Error(
      `Google Search Console OAuth not configured. Missing env var(s): ${missing.join(", ")}`
    );
  }

  const now = Date.now();
  if (cachedToken && now < cachedExpiresAt) {
    return cachedToken;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GSC token exchange failed (${res.status}): ${text}`);
  }

  let json: { access_token?: string; expires_in?: number };
  try {
    json = JSON.parse(text) as { access_token?: string; expires_in?: number };
  } catch {
    throw new Error(`GSC token exchange returned non-JSON response: ${text}`);
  }

  if (!json.access_token) {
    throw new Error(`GSC token exchange returned no access_token: ${text}`);
  }

  const expiresInSec = typeof json.expires_in === "number" ? json.expires_in : 3600;
  // Refresh 60s early to avoid using a token that expires mid-request.
  cachedExpiresAt = now + Math.max(0, expiresInSec - 60) * 1000;
  cachedToken = json.access_token;

  return cachedToken;
}
