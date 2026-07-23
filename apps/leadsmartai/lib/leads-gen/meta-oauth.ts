import "server-only";
import crypto from "node:crypto";

/**
 * Meta OAuth helpers — keep all Meta-specific URL building, token
 * exchange, and Page enumeration in one place so route handlers
 * stay thin. The Graph API version is pinned here too.
 *
 * Flow (Phase 2A):
 *   1. /start: generateAuthorizeUrl() — redirect to FB OAuth dialog
 *   2. user grants on Facebook
 *   3. /callback: exchangeCodeForUserToken() → long-lived user token
 *   4. /callback: fetchPages() → list of {pageId, pageName, pageAccessToken, igBusinessUserId?}
 *   5. /callback: upsert one social_accounts row per Page
 *
 * Scopes are the union of what direct-posting (Phase 2A PR 2) and
 * Lead Ads (Phase 2B) will need. Requesting them all at once means
 * the agent grants once and we don't have to incrementally re-auth.
 * Advanced Access via App Review (see docs/meta-app-review.md)
 * is required before non-developer agents can grant these.
 */

// Graph version lives in one place now (lib/meta/graph.ts) — re-exported here
// so existing importers (meta-post.ts et al) keep working unchanged.
import {
  META_GRAPH_VERSION,
  META_GRAPH_BASE,
  META_OAUTH_DIALOG,
} from "@/lib/meta/graph";

export { META_GRAPH_VERSION, META_GRAPH_BASE };

/**
 * Scopes requested at OAuth time. Order matters only for display in
 * the consent dialog — Meta groups them by API surface anyway.
 */
export const META_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_content_publish",
  // Phase 2B (Lead Ads) will request these too; keeping them in the
  // single grant means agents don't see a second OAuth dialog later.
  "ads_management",
  "ads_read",
  "leads_retrieval",
  "business_management",
] as const;

export type MetaScope = (typeof META_OAUTH_SCOPES)[number];

function appId(): string {
  const v = process.env.META_APP_ID?.trim();
  if (!v) throw new Error("META_APP_ID is not configured");
  return v;
}

function appSecret(): string {
  const v = process.env.META_APP_SECRET?.trim();
  if (!v) throw new Error("META_APP_SECRET is not configured");
  return v;
}

/**
 * Production redirect URI. Must match the Valid OAuth Redirect URIs
 * setting on the Meta App Dashboard exactly (Strict Mode is on).
 */
export function redirectUri(): string {
  const v = process.env.META_OAUTH_REDIRECT_URI?.trim();
  if (v) return v;
  // Sensible default for production so a missing env var doesn't
  // brick the connect button. Dev / preview environments still
  // need the env var since the actual hostname differs.
  return "https://www.closebossai.com/api/leads-gen/connect/meta/callback";
}

/** Build the OAuth dialog URL. `state` is opaque to Meta — they echo
 *  it back unchanged on the callback for our CSRF check. */
export function generateAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: appId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: META_OAUTH_SCOPES.join(","),
    state,
    // Force the consent dialog every time so agents see exactly
    // which permissions they're granting — easier audit + fewer
    // "I didn't know I gave that" support tickets.
    auth_type: "rerequest",
  });
  return `${META_OAUTH_DIALOG}?${params.toString()}`;
}

/**
 * Cryptographically signed state token. We don't have sessions to
 * stash state in, so we make state self-verifying: base64 of
 * `{nonce, agentId, issuedAt, returnTo?}` + HMAC over it. Callback
 * verifies the HMAC + checks issuedAt is recent.
 *
 * `returnTo` is used for mobile OAuth: the mobile app passes a
 * deep-link URL (e.g. `leadsmart://leads-gen/connect/callback`)
 * which the callback redirects to instead of the web connect page.
 * The callback validates the scheme is mobile-only so a malicious
 * actor can't redirect to an arbitrary external URL.
 */
export type StatePayload = {
  nonce: string;
  agentId: string;
  issuedAt: number;
  /** Mobile deep-link the callback should redirect to. Must start with `leadsmart://`. */
  returnTo?: string;
};

export function signState(payload: StatePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", appSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string, maxAgeMs: number): StatePayload {
  const parts = state.split(".");
  if (parts.length !== 2) throw new Error("Malformed state token");
  const [body, sig] = parts;
  const expected = crypto
    .createHmac("sha256", appSecret())
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

type ShortLivedUserTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in?: number;
};

type LongLivedUserTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

/**
 * Exchange the code from /callback for a short-lived user token.
 * The endpoint returns ~1-2h tokens which we then exchange again
 * for ~60-day long-lived tokens.
 *
 * Always succeeds with a 200 — Meta returns errors as JSON with an
 * `error` object. Caller should check `access_token` is present.
 */
export async function exchangeCodeForShortLivedUserToken(
  code: string,
): Promise<{ accessToken: string; expiresIn: number | null }> {
  const params = new URLSearchParams({
    client_id: appId(),
    client_secret: appSecret(),
    redirect_uri: redirectUri(),
    code,
  });
  const res = await fetch(`${META_GRAPH_BASE}/oauth/access_token?${params}`, {
    method: "GET",
  });
  const body = (await res.json().catch(() => ({}))) as ShortLivedUserTokenResponse & {
    error?: { message?: string; type?: string; code?: number };
  };
  if (!res.ok || !body.access_token) {
    const msg = body.error?.message || `HTTP ${res.status}`;
    throw new Error(`Meta short-lived token exchange failed: ${msg}`);
  }
  return {
    accessToken: body.access_token,
    expiresIn: body.expires_in ?? null,
  };
}

/**
 * Exchange a short-lived user token for a long-lived one (~60 days).
 * Long-lived tokens can be re-exchanged to refresh, but we usually
 * just re-grant via OAuth when expiry approaches.
 */
export async function exchangeForLongLivedUserToken(
  shortLivedToken: string,
): Promise<{ accessToken: string; expiresIn: number | null }> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId(),
    client_secret: appSecret(),
    fb_exchange_token: shortLivedToken,
  });
  const res = await fetch(`${META_GRAPH_BASE}/oauth/access_token?${params}`, {
    method: "GET",
  });
  const body = (await res.json().catch(() => ({}))) as LongLivedUserTokenResponse & {
    error?: { message?: string };
  };
  if (!res.ok || !body.access_token) {
    const msg = body.error?.message || `HTTP ${res.status}`;
    throw new Error(`Meta long-lived token exchange failed: ${msg}`);
  }
  return {
    accessToken: body.access_token,
    expiresIn: body.expires_in ?? null,
  };
}

// ── Page enumeration + IG resolution ─────────────────────────────────

export type ConnectedPage = {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  picture: string | null;
  igBusinessUserId: string | null;
  igBusinessUsername: string | null;
};

type MetaMeAccountsResponse = {
  data?: Array<{
    id?: string;
    name?: string;
    access_token?: string;
    picture?: { data?: { url?: string } };
    instagram_business_account?: { id?: string };
  }>;
  paging?: { next?: string };
};

type MetaIgUserResponse = {
  id?: string;
  username?: string;
  error?: { message?: string };
};

const PAGE_FIELDS =
  "id,name,access_token,picture{url},instagram_business_account";

type MetaPageRow = {
  id?: string;
  name?: string;
  access_token?: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id?: string };
};

/**
 * Map one raw Page row (from /me/accounts OR a business edge) to a
 * ConnectedPage, resolving the linked IG Business account's @handle
 * best-effort so the UI can show it next to the Page name.
 */
async function mapPageRow(row: MetaPageRow): Promise<ConnectedPage | null> {
  if (!row.id || !row.access_token) return null;
  const igId = row.instagram_business_account?.id ?? null;
  let igUsername: string | null = null;
  if (igId) {
    try {
      const igRes = await fetch(
        `${META_GRAPH_BASE}/${igId}?fields=username&access_token=${encodeURIComponent(row.access_token)}`,
      );
      const igBody = (await igRes.json().catch(() => ({}))) as MetaIgUserResponse;
      if (igRes.ok && igBody.username) igUsername = igBody.username;
    } catch {
      // ignore — a missing handle is cosmetic
    }
  }
  return {
    pageId: row.id,
    pageName: row.name ?? row.id,
    pageAccessToken: row.access_token,
    picture: row.picture?.data?.url ?? null,
    igBusinessUserId: igId,
    igBusinessUsername: igUsername,
  };
}

/**
 * Pages a Business portfolio owns. These do NOT come back from
 * /me/accounts — the moment a Page joins a portfolio (which linking an
 * Instagram account does automatically) it's only reachable through the
 * business's owned_pages / client_pages edges, and only with
 * `business_management` granted. Without this, a Page that just had an IG
 * account linked (pulling it into a portfolio) loses its IG link — or
 * disappears entirely — on the next reconnect. (Same fix HelmSmart needed.)
 */
async function fetchBusinessOwnedPages(
  userAccessToken: string,
): Promise<ConnectedPage[]> {
  const bizRes = await fetch(
    `${META_GRAPH_BASE}/me/businesses?fields=id,name&access_token=${encodeURIComponent(userAccessToken)}`,
  );
  const bizBody = (await bizRes.json().catch(() => ({}))) as {
    data?: Array<{ id?: string }>;
    error?: { message?: string };
  };
  if (!bizRes.ok || !Array.isArray(bizBody.data)) {
    // Almost always a missing `business_management` grant. Without this log a
    // portfolio-owned Page just vanishes with no explanation anywhere.
    console.warn(
      "[meta-oauth] /me/businesses failed (business_management not granted?):",
      bizBody.error?.message || `HTTP ${bizRes.status}`,
    );
    return [];
  }
  console.info(`[meta-oauth] businesses visible: ${bizBody.data.length}`);

  const out: ConnectedPage[] = [];
  for (const biz of bizBody.data) {
    if (!biz.id) continue;
    // owned_pages = Pages the business owns; client_pages = Pages it was
    // granted access to. Checking both means we don't miss a Page depending
    // on exactly how it landed in the portfolio.
    for (const edge of ["owned_pages", "client_pages"] as const) {
      const res = await fetch(
        `${META_GRAPH_BASE}/${biz.id}/${edge}?fields=${PAGE_FIELDS}&access_token=${encodeURIComponent(userAccessToken)}`,
      );
      const body = (await res.json().catch(() => ({}))) as {
        data?: MetaPageRow[];
        error?: { message?: string };
      };
      if (!res.ok || !Array.isArray(body.data)) continue;
      for (const row of body.data) {
        const p = await mapPageRow(row);
        if (p) out.push(p);
      }
    }
  }
  return out;
}

/**
 * List the Pages a user manages, each with its Page access token +
 * linked IG Business account (if any).
 *
 * Two sources, MERGED: /me/accounts (standalone Pages) AND the business
 * owned_pages / client_pages edges (portfolio Pages, which /me/accounts
 * silently omits — and which carry the IG link after a Page is pulled into
 * a portfolio by an Instagram link). Deduped by Page id, preferring whichever
 * source reported an IG Business account so IG publishing survives the
 * portfolio move.
 */
export async function fetchPagesForUser(
  userAccessToken: string,
): Promise<ConnectedPage[]> {
  const byId = new Map<string, ConnectedPage>();
  const add = (p: ConnectedPage) => {
    const existing = byId.get(p.pageId);
    // Prefer the entry that actually has an IG link — the portfolio edge
    // often reports it when /me/accounts doesn't.
    if (!existing || (!existing.igBusinessUserId && p.igBusinessUserId)) {
      byId.set(p.pageId, p);
    }
  };

  // Source 1: /me/accounts, paginated. Don't hard-fail on error — the
  // business edge below may still surface the Page.
  let url: string | undefined =
    `${META_GRAPH_BASE}/me/accounts?fields=${PAGE_FIELDS}&access_token=${encodeURIComponent(userAccessToken)}`;
  while (url) {
    const res = await fetch(url);
    const body = (await res.json().catch(() => ({}))) as MetaMeAccountsResponse & {
      error?: { message?: string };
    };
    if (!res.ok) {
      console.warn(
        "[meta-oauth] /me/accounts failed:",
        body.error?.message || `HTTP ${res.status}`,
      );
      break;
    }
    const rows = body.data ?? [];
    console.info(
      `[meta-oauth] /me/accounts returned ${rows.length} page(s), ${
        rows.filter((r) => r.access_token).length
      } with a token`,
    );
    for (const row of rows) {
      const p = await mapPageRow(row as MetaPageRow);
      if (p) add(p);
    }
    url = body.paging?.next;
  }
  const fromAccounts = byId.size;

  // Source 2: business-owned / client Pages (portfolio). Best-effort — a
  // token without business_management just yields nothing here.
  try {
    for (const p of await fetchBusinessOwnedPages(userAccessToken)) add(p);
  } catch (e) {
    console.warn(
      "[meta-oauth] business-owned pages lookup failed:",
      e instanceof Error ? e.message : e,
    );
  }

  const pages = Array.from(byId.values());
  // One line that answers "why did the connect find nothing?" — which source
  // produced Pages, and how many carry the Instagram link.
  console.info(
    `[meta-oauth] resolved ${pages.length} page(s): ${fromAccounts} from /me/accounts, ` +
      `${pages.length - fromAccounts} additional from business portfolio; ` +
      `${pages.filter((p) => p.igBusinessUserId).length} with an Instagram account`,
  );
  return pages;
}
