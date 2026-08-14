import "server-only";

import { metaGraphBase } from "@helm/dna-marketing";

import {
  deleteConnection,
  getConnection,
  upsertConnection,
  type UpsertConnection,
} from "@/lib/social";

/**
 * Facebook Page selection for the Meta connection.
 *
 * A Meta account can administer several Pages, but a connection stores exactly
 * one. The OAuth exchange has to pick a default, and picking silently stranded
 * people on the wrong brand (e.g. posting to a nonprofit Page instead of the
 * product's). These helpers let the user SWITCH afterwards without redoing the
 * whole OAuth dance.
 *
 * To re-list Pages later we need the long-lived USER token — Page tokens can't
 * call /me/accounts. It's kept in the connection's otherwise-unused
 * `refresh_token` column, which is exactly its role here: the credential used
 * to re-derive Page tokens. Never sent to the browser.
 */

export type MetaPage = {
  id: string;
  name: string;
  instagramUsername: string | null;
  /** True when this Page is the one currently stored on the connection. */
  current: boolean;
};

type PageItem = {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string };
};

/** The scope string we record on Meta connections. */
function scopeOf(existingScope: string | null): string | null {
  return existingScope;
}

/**
 * Build the connection rows for a chosen Page (Facebook + linked Instagram).
 * Shared by the OAuth exchange and the Page switcher so both store an
 * identical shape — including the user token needed to switch again later.
 */
export function buildMetaConnections(
  page: PageItem,
  userToken: string,
  scope?: string | null,
): UpsertConnection[] {
  const out: UpsertConnection[] = [
    {
      platform: "facebook",
      provider_account_id: page.id,
      account_name: page.name,
      access_token: page.access_token,
      // Long-lived user token — lets us re-list and switch Pages later.
      refresh_token: userToken,
      token_expires_at: null, // page tokens from a long-lived user token don't expire
      scope: scopeOf(scope ?? null),
      metadata: { fbPageId: page.id },
    },
  ];
  if (page.instagram_business_account) {
    const ig = page.instagram_business_account;
    out.push({
      platform: "instagram",
      provider_account_id: ig.id,
      account_name: ig.username ? `@${ig.username}` : page.name,
      access_token: page.access_token,
      refresh_token: userToken,
      token_expires_at: null,
      scope: scopeOf(scope ?? null),
      metadata: { igUserId: ig.id, fbPageId: page.id },
    });
  }
  return out;
}

async function fetchPages(userToken: string): Promise<PageItem[]> {
  const url = `${metaGraphBase()}/me/accounts?fields=name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(
    userToken,
  )}`;
  const res = await fetch(url, { cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as {
    data?: PageItem[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(body.error?.message || "Couldn't load your Facebook Pages.");
  return body.data ?? [];
}

/**
 * Pages this user granted us, flagged with which one is currently connected.
 * Returns [] when Meta isn't connected or the stored token predates this
 * feature (those connections simply can't switch until reconnected).
 */
export async function listMetaPages(userId: string): Promise<MetaPage[]> {
  const conn = await getConnection(userId, "facebook");
  const userToken = conn?.refresh_token;
  if (!conn || !userToken) return [];

  const pages = await fetchPages(userToken);
  return pages.map((p) => ({
    id: p.id,
    name: p.name,
    instagramUsername: p.instagram_business_account?.username ?? null,
    current: p.id === conn.provider_account_id,
  }));
}

/**
 * Point the Meta connection at a different Page, re-deriving both the Facebook
 * and Instagram rows from that Page's own token.
 *
 * If the newly chosen Page has NO linked Instagram, the old Instagram row is
 * deleted rather than left behind — otherwise Instagram would keep publishing
 * to the previous brand's account while the UI showed the new Page, which is
 * precisely the silent mis-posting this feature exists to prevent.
 */
export async function selectMetaPage(
  userId: string,
  pageId: string,
): Promise<{ pageName: string; instagramUsername: string | null }> {
  const conn = await getConnection(userId, "facebook");
  const userToken = conn?.refresh_token;
  if (!conn || !userToken) {
    throw new Error("Reconnect Facebook & Instagram first, then you can switch Pages.");
  }

  const pages = await fetchPages(userToken);
  const page = pages.find((p) => p.id === pageId);
  if (!page) throw new Error("That Page is no longer available on your Facebook account.");

  for (const c of buildMetaConnections(page, userToken, conn.scope)) {
    await upsertConnection(userId, c);
  }
  if (!page.instagram_business_account) {
    await deleteConnection(userId, "instagram");
  }

  return {
    pageName: page.name,
    instagramUsername: page.instagram_business_account?.username ?? null,
  };
}
