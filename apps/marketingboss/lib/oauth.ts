import "server-only";
import {
  metaGraphBase,
  metaOAuthDialog,
  buildThreadsAuthorizeUrl,
  buildThreadsTokenExchangeRequest,
  parseThreadsTokenExchangeResponse,
  buildThreadsLongLivedTokenUrl,
  parseThreadsLongLivedTokenResponse,
  threadsGraphBase,
  THREADS_SCOPES,
} from "@helm/dna-marketing";

import { buildMetaConnections } from "@/lib/metaPages";

// Publish scopes + insights read (for engagement metrics). Adding
// threads_manage_insights means users must RECONNECT Threads to grant it.
const THREADS_INSIGHT_SCOPES = [...THREADS_SCOPES, "threads_manage_insights"];
import type { UpsertConnection } from "@/lib/social";
import { tiktokConfigured, getAuthUrl as tiktokAuthUrl, exchangeCode as tiktokExchange } from "@/lib/tiktok";

/**
 * Per-provider OAuth adapters. Each MarketingBoss OAuth app is its own (its own
 * consent branding). A provider can yield MORE THAN ONE connection — Meta's one
 * grant produces both a Facebook and an Instagram connection.
 */
export interface OAuthAdapter {
  /** Route key: /api/social/{connect,callback}/<key>. */
  key: string;
  /** Platforms this provider connects (for the UI). */
  platforms: string[];
  label: string;
  configured(): boolean;
  authUrl(origin: string, state: string): string;
  /** Exchange the code → the connection rows to upsert. */
  exchange(code: string, origin: string): Promise<UpsertConnection[]>;
}

/**
 * Always use the APEX domain for the redirect URI, so a single whitelisted URI
 * works whether the user is on www or the bare domain (Meta/LinkedIn/etc. do a
 * strict exact-match). The state cookie is scoped to the registrable domain (see
 * the connect route) so it's readable after the apex redirect.
 */
function redirectUri(origin: string, key: string): string {
  return `${origin.replace(/:\/\/www\./, "://")}/api/social/callback/${key}`;
}

async function getJson<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit,
): Promise<{ status: number; body: T }> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body };
}

// ─── Meta (Facebook + Instagram) ─────────────────────────────────────────────
const META_SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "business_management",
  "instagram_basic",
  "instagram_content_publish",
];

const metaAdapter: OAuthAdapter = {
  key: "meta",
  platforms: ["facebook", "instagram"],
  label: "Facebook & Instagram",
  configured: () => !!(process.env.META_APP_ID && process.env.META_APP_SECRET),
  authUrl(origin, state) {
    const p = new URLSearchParams({
      client_id: process.env.META_APP_ID!,
      redirect_uri: redirectUri(origin, "meta"),
      state,
      response_type: "code",
      scope: META_SCOPES.join(","),
    });
    return `${metaOAuthDialog()}?${p.toString()}`;
  },
  async exchange(code, origin) {
    const id = process.env.META_APP_ID!;
    const secret = process.env.META_APP_SECRET!;
    const base = metaGraphBase();

    const short = await getJson<{ access_token?: string; error?: { message?: string } }>(
      `${base}/oauth/access_token?client_id=${id}&client_secret=${secret}&redirect_uri=${encodeURIComponent(
        redirectUri(origin, "meta"),
      )}&code=${encodeURIComponent(code)}`,
    );
    const shortToken = short.body?.access_token;
    if (!shortToken) throw new Error(short.body?.error?.message || "Meta code exchange failed.");

    const long = await getJson<{ access_token?: string; expires_in?: number }>(
      `${base}/oauth/access_token?grant_type=fb_exchange_token&client_id=${id}&client_secret=${secret}&fb_exchange_token=${encodeURIComponent(
        shortToken,
      )}`,
    );
    const userToken = long.body?.access_token || shortToken;

    type PageItem = {
      id: string;
      name: string;
      access_token: string;
      instagram_business_account?: { id: string; username?: string };
    };
    const pages = await getJson<{ data?: PageItem[] }>(
      `${base}/me/accounts?fields=name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(
        userToken,
      )}`,
    );
    const list = pages.body?.data ?? [];
    if (list.length === 0) throw new Error("No Facebook Page found — create/connect a Page first.");
    // Default to a Page that also has an Instagram business account. When the
    // user granted more than one Page this is only a STARTING point — they can
    // switch afterwards from Settings › Connections (see lib/metaPages.ts).
    // Silently picking one used to strand people on the wrong brand account.
    const page = list.find((p) => p.instagram_business_account) ?? list[0];

    return buildMetaConnections(page, userToken, META_SCOPES.join(","));
  },
};

// ─── Threads ─────────────────────────────────────────────────────────────────
const threadsAdapter: OAuthAdapter = {
  key: "threads",
  platforms: ["threads"],
  label: "Threads",
  configured: () => !!(process.env.THREADS_APP_ID && process.env.THREADS_APP_SECRET),
  authUrl(origin, state) {
    return buildThreadsAuthorizeUrl({
      clientId: process.env.THREADS_APP_ID!,
      redirectUri: redirectUri(origin, "threads"),
      state,
      scopes: THREADS_INSIGHT_SCOPES,
    });
  },
  async exchange(code, origin) {
    const clientId = process.env.THREADS_APP_ID!;
    const clientSecret = process.env.THREADS_APP_SECRET!;
    const ex = buildThreadsTokenExchangeRequest({
      clientId,
      clientSecret,
      redirectUri: redirectUri(origin, "threads"),
      code,
    });
    const exRes = await getJson(ex.url, { method: "POST", body: ex.body });
    const parsed = parseThreadsTokenExchangeResponse(exRes.status, exRes.body);
    if (!parsed.ok) throw new Error(parsed.error);

    const ll = await getJson(buildThreadsLongLivedTokenUrl({ clientSecret, shortLivedToken: parsed.accessToken }));
    const long = parseThreadsLongLivedTokenResponse(ll.status, ll.body);
    const accessToken = long.ok ? long.accessToken : parsed.accessToken;
    const expiresIn = long.ok ? long.expiresIn : 60 * 24 * 60 * 60;

    // The connections UI renders "<Platform> · <account_name>", so a hardcoded
    // "Threads" produced "Threads · Threads" — you could see that something was
    // connected but not WHICH account, which matters when one person runs
    // several. Ask the API who we just linked. Best-effort: a missing display
    // name must never fail an otherwise good connection, since the token and
    // user id are what publishing actually needs.
    let accountName = "Threads";
    try {
      const me = await getJson<{ username?: string }>(
        `${threadsGraphBase()}/me?fields=id,username&access_token=${encodeURIComponent(accessToken)}`,
      );
      const username = me.body?.username?.trim();
      if (username) accountName = `@${username}`;
    } catch {
      /* keep the generic label */
    }

    return [
      {
        platform: "threads",
        provider_account_id: parsed.userId,
        account_name: accountName,
        access_token: accessToken,
        refresh_token: null,
        token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        scope: THREADS_INSIGHT_SCOPES.join(","),
        metadata: { threadsUserId: parsed.userId },
      },
    ];
  },
};

// ─── LinkedIn ────────────────────────────────────────────────────────────────
const LINKEDIN_SCOPES = ["openid", "profile", "w_member_social"];

const linkedinAdapter: OAuthAdapter = {
  key: "linkedin",
  platforms: ["linkedin"],
  label: "LinkedIn",
  configured: () => !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
  authUrl(origin, state) {
    const p = new URLSearchParams({
      response_type: "code",
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      redirect_uri: redirectUri(origin, "linkedin"),
      state,
      scope: LINKEDIN_SCOPES.join(" "),
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${p.toString()}`;
  },
  async exchange(code, origin) {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(origin, "linkedin"),
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    });
    const tok = await getJson<{ access_token?: string; expires_in?: number; error_description?: string }>(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      },
    );
    const accessToken = tok.body?.access_token;
    if (!accessToken) throw new Error(tok.body?.error_description || "LinkedIn code exchange failed.");
    const expiresIn = Number(tok.body?.expires_in) || 60 * 24 * 60 * 60;

    const me = await getJson<{ sub?: string; name?: string }>("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const sub = me.body?.sub;
    if (!sub) throw new Error("Could not read the LinkedIn profile.");
    const memberUrn = `urn:li:person:${sub}`;

    return [
      {
        platform: "linkedin",
        provider_account_id: memberUrn,
        account_name: me.body?.name ?? "LinkedIn",
        access_token: accessToken,
        refresh_token: null,
        token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        scope: LINKEDIN_SCOPES.join(" "),
        metadata: { memberUrn },
      },
    ];
  },
};

// ─── Pinterest ───────────────────────────────────────────────────────────────
const PINTEREST_SCOPES = ["boards:read", "pins:read", "pins:write"];

const pinterestAdapter: OAuthAdapter = {
  key: "pinterest",
  platforms: ["pinterest"],
  label: "Pinterest",
  configured: () => !!(process.env.PINTEREST_APP_ID && process.env.PINTEREST_APP_SECRET),
  authUrl(origin, state) {
    const p = new URLSearchParams({
      client_id: process.env.PINTEREST_APP_ID!,
      redirect_uri: redirectUri(origin, "pinterest"),
      response_type: "code",
      scope: PINTEREST_SCOPES.join(","),
      state,
    });
    return `https://www.pinterest.com/oauth/?${p.toString()}`;
  },
  async exchange(code, origin) {
    const basic = Buffer.from(
      `${process.env.PINTEREST_APP_ID}:${process.env.PINTEREST_APP_SECRET}`,
    ).toString("base64");
    const tok = await getJson<{ access_token?: string; refresh_token?: string; expires_in?: number; message?: string }>(
      "https://api.pinterest.com/v5/oauth/token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri(origin, "pinterest"),
        }),
      },
    );
    const accessToken = tok.body?.access_token;
    if (!accessToken) throw new Error(tok.body?.message || "Pinterest code exchange failed.");
    const expiresIn = Number(tok.body?.expires_in) || 30 * 24 * 60 * 60;

    // Pick a board to pin into (first one).
    const boards = await getJson<{ items?: { id?: string; name?: string }[] }>(
      "https://api.pinterest.com/v5/boards?page_size=1",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const board = (boards.body?.items ?? [])[0];
    const boardId = board?.id;
    const metadata: Record<string, string> = boardId ? { boardId } : {};

    return [
      {
        platform: "pinterest",
        provider_account_id: boardId ?? null,
        account_name: board?.name ? `Board: ${board.name}` : "Pinterest",
        access_token: accessToken,
        refresh_token: tok.body?.refresh_token ?? null,
        token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        scope: PINTEREST_SCOPES.join(","),
        metadata,
      },
    ];
  },
};

// ─── TikTok (video) ──────────────────────────────────────────────────────────
const tiktokAdapter: OAuthAdapter = {
  key: "tiktok",
  platforms: ["tiktok"],
  label: "TikTok",
  configured: () => tiktokConfigured(),
  authUrl(origin, state) {
    return tiktokAuthUrl(origin, state);
  },
  async exchange(code, origin) {
    const t = await tiktokExchange(code, origin);
    // Best-effort display name for the UI.
    let name = "TikTok";
    try {
      const r = await getJson<{ data?: { user?: { display_name?: string } } }>(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name",
        { headers: { Authorization: `Bearer ${t.access_token}` } },
      );
      if (r.body?.data?.user?.display_name) name = `@${r.body.data.user.display_name}`;
    } catch {
      /* keep default */
    }
    const metadata: Record<string, string> = t.open_id ? { openId: t.open_id } : {};
    return [
      {
        platform: "tiktok",
        provider_account_id: t.open_id ?? null,
        account_name: name,
        access_token: t.access_token,
        refresh_token: t.refresh_token ?? null,
        token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
        scope: t.scope ?? "user.info.basic,video.publish,video.upload",
        metadata,
      },
    ];
  },
};

export const OAUTH_ADAPTERS: Record<string, OAuthAdapter> = {
  meta: metaAdapter,
  threads: threadsAdapter,
  linkedin: linkedinAdapter,
  pinterest: pinterestAdapter,
  tiktok: tiktokAdapter,
};

export function getAdapter(key: string): OAuthAdapter | null {
  return OAUTH_ADAPTERS[key] ?? null;
}
