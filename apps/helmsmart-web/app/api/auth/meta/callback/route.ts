/**
 * GET /api/auth/meta/callback
 * Meta redirects here after consent. Verifies the CSRF nonce, exchanges the code
 * for a user token, extends it to ~60 days, then resolves the Pages the user
 * granted and stores the chosen Page's own token against the active org.
 *
 * NOTE the token we persist is the PAGE token from /me/accounts, not the user
 * token — publishing with a user token fails in a way Meta's error message
 * doesn't make obvious.
 */
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  exchangeMetaCode,
  extendMetaToken,
  fetchMetaPages,
  getMetaConfig,
  saveMetaConnection,
} from "@/lib/meta";

export async function GET(req: Request) {
  // Same host the flow started on — the redirect_uri sent to the token exchange
  // must match the authorize call EXACTLY, and staying on-host is also what
  // keeps the user inside their own vertical.
  const host = (await headers()).get("host");
  const { baseUrl } = getMetaConfig(host);
  const back = (q: string) => NextResponse.redirect(`${baseUrl}/social?${q}`);

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError =
      url.searchParams.get("error_description") || url.searchParams.get("error");
    if (oauthError) return back(`meta_error=${encodeURIComponent(oauthError)}`);

    const cookieStore = await cookies();
    const orgId = cookieStore.get("helmsmart-org-id")?.value;
    const stateCookie = cookieStore.get("meta_oauth_state")?.value;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!code || !orgId || !user) return back("meta_error=missing_context");
    if (!state || !stateCookie || state !== stateCookie) return back("meta_error=bad_state");

    const userToken = await exchangeMetaCode(code, host);
    if (!userToken) return back("meta_error=token_exchange_failed");

    // Extend BEFORE reading pages: Page tokens derived from a long-lived user
    // token are themselves long-lived, which is the difference between a
    // connection that lasts two months and one that dies in an hour.
    const longLived = await extendMetaToken(userToken);

    const pages = await fetchMetaPages(longLived);
    if (pages.length === 0) {
      // Almost always "granted the app but didn't tick a Page" — say that,
      // rather than a generic failure they can't act on.
      return back("meta_error=no_pages_granted");
    }

    // Meta lets the user grant several Pages at once, and the first one returned
    // is NOT necessarily the one THIS org is for — an established Page (e.g. a
    // sibling brand) sorts ahead of a freshly-created one, so `pages[0]` silently
    // connects the wrong Page and you only find out when a post lands on it.
    // Prefer the Page whose name matches this org's name; fall back to the first
    // only when nothing matches.
    let page = pages[0];
    if (pages.length > 1) {
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", orgId)
        .single();
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const orgName = norm(org?.name ?? "");
      if (orgName.length >= 3) {
        const match = pages.find((p) => {
          const pn = norm(p.pageName);
          return pn.includes(orgName) || orgName.includes(pn);
        });
        if (match) page = match;
      }
    }
    await saveMetaConnection(orgId, page);

    const q = new URLSearchParams({ meta: "connected", page: page.pageName });
    if (!page.igUserId) q.set("ig", "unlinked");
    const res = back(q.toString());
    res.cookies.delete("meta_oauth_state");
    return res;
  } catch (e) {
    console.error("[meta] callback error:", e);
    return back("meta_error=server_error");
  }
}
