/**
 * LinkedIn integration — OAuth (Share API, `w_member_social`) + publishing.
 *
 * Mirrors the google-business integration but for LinkedIn: per-org tokens live
 * in `org_oauth_tokens` (provider='linkedin'). The access token is stored
 * ENCRYPTED (lib/crypto.ts); the member/author URN — what `/rest/posts` needs as
 * `author` — is stored in `account_email` (that column is the generic
 * "connected account identifier" for a provider; for LinkedIn it's the URN, not
 * an email). This keeps the loop working with no schema migration.
 *
 * The `w_member_social` + OIDC scopes are all self-serve (no partner-program
 * approval), so any LinkedIn developer app can request them. Posting to a
 * Company Page (org author) would instead need the approval-gated Community
 * Management API — out of scope for this v1.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/crypto";

export const LINKEDIN_SCOPES = "openid profile email w_member_social";

// LinkedIn sunsets each YYYYMM API version ~12 months after release (HTTP 426
// NONEXISTENT_VERSION once lapsed) — keep within the last year.
export const LINKEDIN_API_VERSION = "202506";

export function getLinkedInConfig() {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002";
  const redirectUri = `${baseUrl}/api/auth/linkedin/callback`;
  return { clientId, clientSecret, redirectUri, baseUrl };
}

export function isLinkedInConfigured(): boolean {
  const { clientId, clientSecret } = getLinkedInConfig();
  return !!(clientId && clientSecret);
}

/** Exchange the OAuth code for a ~60-day access token. */
export async function exchangeLinkedInCode(
  code: string,
): Promise<{ accessToken: string; expiresIn: number } | null> {
  const { clientId, clientSecret, redirectUri } = getLinkedInConfig();
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId!,
      client_secret: clientSecret!,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!res.ok || !json.access_token) return null;
  return { accessToken: json.access_token, expiresIn: json.expires_in ?? 60 * 24 * 60 * 60 };
}

/** Fetch the connected member's URN (author) + display fields via OIDC userinfo. */
export async function fetchLinkedInUserInfo(
  accessToken: string,
): Promise<{ memberUrn: string; name: string | null; email: string | null } | null> {
  const res = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json().catch(() => ({}))) as {
    sub?: string;
    name?: string;
    email?: string;
  };
  if (!res.ok || !json.sub) return null;
  return { memberUrn: `urn:li:person:${json.sub}`, name: json.name ?? null, email: json.email ?? null };
}

export type LinkedInConnection = {
  authorUrn: string;
  accessToken: string;
  expiresAt: string | null;
};

/** Read + decrypt an org's LinkedIn connection (service-role, so cron-safe). */
export async function getLinkedInConnection(orgId: string): Promise<LinkedInConnection | null> {
  const db = await createServiceClient();
  const { data } = await db
    .from("org_oauth_tokens")
    .select("access_token, account_email, expires_at")
    .eq("organization_id", orgId)
    .eq("provider", "linkedin")
    .maybeSingle();
  const row = data as { access_token?: string; account_email?: string; expires_at?: string | null } | null;
  if (!row?.access_token || !row?.account_email) return null;
  let accessToken: string;
  try {
    accessToken = decrypt(row.access_token);
  } catch {
    return null; // key mismatch / corrupt — treat as not connected (reconnect)
  }
  return { authorUrn: row.account_email, accessToken, expiresAt: row.expires_at ?? null };
}

/** Encrypt a token for storage (thin wrapper so callers don't import crypto). */
export function encryptLinkedInToken(plaintext: string): string {
  return encrypt(plaintext);
}

function postUrlFromUrn(urn: string): string | null {
  const m = urn.match(/^urn:li:(share|ugcPost):(\d+)$/);
  if (!m) return null;
  return `https://www.linkedin.com/feed/update/urn:li:${m[1]}:${m[2]}/`;
}

export type PublishResult = { ok: boolean; id?: string; url?: string | null; error?: string };

/**
 * Upload a public image to LinkedIn, returning its image URN to reference in a
 * post. Three calls: initializeUpload → PUT the bytes to the returned URL → the
 * caller attaches the URN. Throws on any failure so the caller can fall back to
 * a text-only post.
 */
async function uploadLinkedInImage(conn: LinkedInConnection, imageUrl: string): Promise<string> {
  const initRes = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.accessToken}`,
      "LinkedIn-Version": LINKEDIN_API_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ initializeUploadRequest: { owner: conn.authorUrn } }),
  });
  if (!initRes.ok) throw new Error(`initializeUpload ${initRes.status}`);
  const init = (await initRes.json().catch(() => ({}))) as {
    value?: { uploadUrl?: string; image?: string };
  };
  const uploadUrl = init.value?.uploadUrl;
  const imageUrn = init.value?.image;
  if (!uploadUrl || !imageUrn) throw new Error("initializeUpload: missing uploadUrl/image");

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`fetch image ${imgRes.status}`);
  const bytes = new Uint8Array(await imgRes.arrayBuffer());

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${conn.accessToken}` },
    body: bytes,
  });
  if (!putRes.ok) throw new Error(`upload ${putRes.status}`);
  return imageUrn;
}

/** Publish text (+ optional image) to the org's connected LinkedIn member feed. */
export async function publishLinkedInPost(
  orgId: string,
  text: string,
  imageUrl?: string | null,
): Promise<PublishResult> {
  const conn = await getLinkedInConnection(orgId);
  if (!conn) return { ok: false, error: "LinkedIn not connected" };
  if (conn.expiresAt && new Date(conn.expiresAt) < new Date()) {
    return { ok: false, error: "LinkedIn token expired — reconnect" };
  }

  // Best-effort image: LinkedIn image posting is a 3-call dance, so if any part
  // of the UPLOAD fails we simply post text-only rather than losing the post.
  let imageUrn: string | null = null;
  if (imageUrl) {
    try {
      imageUrn = await uploadLinkedInImage(conn, imageUrl);
    } catch (e) {
      console.warn("[linkedin] image upload failed, posting text-only:", e instanceof Error ? e.message : e);
    }
  }

  const create = (withImage: boolean) =>
    fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        "LinkedIn-Version": LINKEDIN_API_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        author: conn.authorUrn,
        commentary: text,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        ...(withImage && imageUrn ? { content: { media: { id: imageUrn } } } : {}),
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    });

  try {
    let res = await create(true);
    // If ATTACHING the image is what broke the create, retry text-only so a
    // media formatting hiccup never costs the whole post.
    if (!res.ok && imageUrn) {
      console.warn(`[linkedin] post with image failed (${res.status}), retrying text-only`);
      res = await create(false);
    }
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, error: json.message || `LinkedIn error ${res.status}` };
    }
    const urn = res.headers.get("x-restli-id") || "";
    return { ok: true, id: urn, url: postUrlFromUrn(urn) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "LinkedIn request failed" };
  }
}
