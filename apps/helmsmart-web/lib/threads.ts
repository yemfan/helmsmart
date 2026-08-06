/**
 * Threads integration — OAuth + publishing.
 *
 * Mirrors lib/linkedin.ts: per-org tokens live in `org_oauth_tokens`
 * (provider='threads'), the access token stored ENCRYPTED (lib/crypto.ts), and
 * the Threads user id — the `{user-id}` the publish endpoints need — stored in
 * `account_email` (the generic "connected account identifier" column). The
 * @handle goes in `metadata`.
 *
 * All the Graph knowledge (endpoints, the two-step container -> publish dance,
 * the async container-status poll, token exchange) comes from the shared
 * @helm/dna-marketing core — the SAME builders CloseBoss uses, so the two apps
 * can't drift. This file only performs the effects + storage.
 *
 * Threads is a Meta product but authorizes SEPARATELY from Facebook/Instagram:
 * its own dialog on threads.net, its own token host on graph.threads.net, and
 * its own App ID/Secret (THREADS_APP_ID / THREADS_APP_SECRET).
 */
import {
  THREADS_SCOPES,
  buildThreadsAuthorizeUrl,
  buildThreadsContainerRequest,
  buildThreadsContainerStatusUrl,
  buildThreadsLongLivedTokenUrl,
  buildThreadsPermalinkUrl,
  buildThreadsPublishRequest,
  buildThreadsTokenExchangeRequest,
  parseThreadsContainerResponse,
  parseThreadsContainerStatusResponse,
  parseThreadsLongLivedTokenResponse,
  parseThreadsPublishResponse,
  parseThreadsTokenExchangeResponse,
  threadsGraphBase,
} from "@helm/dna-marketing";

import { createServiceClient } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/crypto";

export function getThreadsConfig() {
  // Pasted secrets frequently carry a trailing newline/space; an untrimmed
  // secret fails the token exchange silently (same class of bug as #899's
  // untrimmed META_APP_SECRET). Trim defensively so a stray whitespace char
  // can never be the reason a connect fails.
  const clientId = process.env.THREADS_APP_ID?.trim();
  const clientSecret = process.env.THREADS_APP_SECRET?.trim();
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002").trim();
  const redirectUri = `${baseUrl}/api/auth/threads/callback`;
  return { clientId, clientSecret, redirectUri, baseUrl };
}

export function isThreadsConfigured(): boolean {
  const { clientId, clientSecret } = getThreadsConfig();
  return !!(clientId && clientSecret);
}

/** Build the OAuth authorize URL (state is the CSRF nonce echoed back). */
export function threadsAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = getThreadsConfig();
  return buildThreadsAuthorizeUrl({
    clientId: clientId!,
    redirectUri,
    state,
    scopes: THREADS_SCOPES,
  });
}

/**
 * Exchange the OAuth code for a token + the Threads user id, upgrading to a
 * long-lived (~60-day) token best-effort.
 */
export async function exchangeThreadsCode(
  code: string,
): Promise<
  | { ok: true; accessToken: string; userId: string; expiresIn: number }
  | { ok: false; error: string }
> {
  const { clientId, clientSecret, redirectUri } = getThreadsConfig();
  const req = buildThreadsTokenExchangeRequest({
    clientId: clientId!,
    clientSecret: clientSecret!,
    redirectUri,
    code,
  });
  const res = await fetch(req.url, { method: "POST", body: req.body });
  const short = parseThreadsTokenExchangeResponse(
    res.status,
    await res.json().catch(() => ({})),
  );
  if (!short.ok) {
    // Surface the REAL reason (bad secret, redirect mismatch, used code, …)
    // instead of a blanket failure — the callback logs it and can pass a short
    // detail back so a connect never fails for an invisible reason.
    console.error("[threads] token exchange failed:", short.error);
    return { ok: false, error: short.error };
  }

  let accessToken = short.accessToken;
  let expiresIn = 60 * 60; // short-lived default
  try {
    const lres = await fetch(
      buildThreadsLongLivedTokenUrl({
        clientSecret: clientSecret!,
        shortLivedToken: short.accessToken,
      }),
    );
    const long = parseThreadsLongLivedTokenResponse(
      lres.status,
      await lres.json().catch(() => ({})),
    );
    if (long.ok) {
      accessToken = long.accessToken;
      expiresIn = long.expiresIn;
    }
  } catch {
    // keep the short-lived token — a connection that works for an hour beats
    // failing the whole connect
  }
  return { ok: true, accessToken, userId: short.userId, expiresIn };
}

/** Canonical profile (id + @handle) via graph.threads.net /me. */
export async function fetchThreadsProfile(
  accessToken: string,
): Promise<{ userId: string; username: string | null } | null> {
  const res = await fetch(
    `${threadsGraphBase()}/me?fields=id,username&access_token=${encodeURIComponent(accessToken)}`,
  );
  const json = (await res.json().catch(() => ({}))) as {
    id?: string | number;
    username?: string;
  };
  if (!res.ok || json.id == null) return null;
  return { userId: String(json.id), username: json.username ?? null };
}

/** Encrypt a token for storage (thin wrapper so callers don't import crypto). */
export function encryptThreadsToken(plaintext: string): string {
  return encrypt(plaintext);
}

type ThreadsConnection = {
  userId: string;
  accessToken: string;
  expiresAt: string | null;
};

/** Read + decrypt an org's Threads connection (service-role, cron-safe). */
export async function getThreadsConnection(
  orgId: string,
): Promise<ThreadsConnection | null> {
  const db = await createServiceClient();
  const { data } = await db
    .from("org_oauth_tokens")
    .select("access_token, account_email, expires_at")
    .eq("organization_id", orgId)
    .eq("provider", "threads")
    .maybeSingle();
  const row = data as {
    access_token?: string;
    account_email?: string;
    expires_at?: string | null;
  } | null;
  if (!row?.access_token || !row?.account_email) return null;
  let accessToken: string;
  try {
    accessToken = decrypt(row.access_token);
  } catch {
    return null; // key mismatch / corrupt — treat as not connected (reconnect)
  }
  return { userId: row.account_email, accessToken, expiresAt: row.expires_at ?? null };
}

export type PublishResult = {
  ok: boolean;
  id?: string;
  url?: string | null;
  error?: string;
  retryable?: boolean;
};

async function postForm(req: { url: string; body: URLSearchParams }) {
  const res = await fetch(req.url, { method: "POST", body: req.body });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

/**
 * Wait for the container to finish processing before publishing. Threads
 * processes it asynchronously; publishing too early fails "media not found",
 * even for text-only posts.
 */
async function waitForContainer(
  containerId: string,
  accessToken: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const MAX_ATTEMPTS = 11; // ~25s worst case
  const DELAY_MS = 2500;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetch(
      buildThreadsContainerStatusUrl({
        containerId,
        accessToken,
        graphBase: threadsGraphBase(),
      }),
    );
    const state = parseThreadsContainerStatusResponse(
      res.status,
      await res.json().catch(() => ({})),
    );
    if (state.state === "ready") return { ok: true };
    if (state.state === "failed") return { ok: false, error: state.error };
    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
  return {
    ok: false,
    error: "Threads is still processing this post. Please try again in a moment.",
  };
}

/**
 * Publish to the org's connected Threads account. Text is required; an image is
 * optional (Threads supports text-only posts, unlike Instagram).
 */
export async function publishThreadsPost(
  orgId: string,
  text: string,
  imageUrl?: string | null,
): Promise<PublishResult> {
  const conn = await getThreadsConnection(orgId);
  if (!conn) return { ok: false, error: "Threads not connected", retryable: false };
  if (conn.expiresAt && new Date(conn.expiresAt) < new Date()) {
    return { ok: false, error: "Threads token expired — reconnect", retryable: false };
  }

  const graphBase = threadsGraphBase();
  const { userId, accessToken } = conn;

  const created = await postForm(
    buildThreadsContainerRequest({ userId, accessToken, text, imageUrl, graphBase }),
  );
  const container = parseThreadsContainerResponse(created.status, created.json);
  if (!container.ok) {
    return { ok: false, error: container.error, retryable: container.retryable };
  }

  const ready = await waitForContainer(container.containerId, accessToken);
  if (!ready.ok) return { ok: false, error: ready.error, retryable: true };

  const published = await postForm(
    buildThreadsPublishRequest({
      userId,
      accessToken,
      containerId: container.containerId,
      graphBase,
    }),
  );
  const result = parseThreadsPublishResponse(published.status, published.json);
  if (!result.ok) {
    return { ok: false, error: result.error, retryable: result.retryable };
  }

  let url: string | null = null;
  try {
    const res = await fetch(
      buildThreadsPermalinkUrl({ mediaId: result.postId, accessToken, graphBase }),
    );
    const j = (await res.json().catch(() => ({}))) as { permalink?: string };
    if (res.ok && j.permalink) url = j.permalink;
  } catch {
    // permalink is best-effort — the post is already live
  }
  return { ok: true, id: result.postId, url };
}
