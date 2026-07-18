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
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  exchangeMetaCode,
  extendMetaToken,
  fetchMetaPages,
  getMetaConfig,
  saveMetaConnection,
} from "@/lib/meta";

export async function GET(req: Request) {
  const { baseUrl } = getMetaConfig();
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

    const userToken = await exchangeMetaCode(code);
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

    // Meta's own consent dialog is where a Page is chosen, so we take what was
    // granted. Surfacing the name lets someone spot a wrong pick immediately —
    // connecting the wrong Page and finding out when a post appears on it is a
    // genuinely bad surprise.
    const page = pages[0];
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
