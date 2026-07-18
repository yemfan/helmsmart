/**
 * GET /api/auth/linkedin/callback
 * LinkedIn redirects here after consent. Verifies the CSRF nonce, exchanges the
 * code for a token, looks up the member URN via OIDC userinfo, and stores the
 * (encrypted) token against the logged-in user's active org. Mirrors the
 * google-business callback.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  getLinkedInConfig,
  exchangeLinkedInCode,
  fetchLinkedInUserInfo,
  encryptLinkedInToken,
} from "@/lib/linkedin";

export async function GET(req: Request) {
  const { baseUrl } = getLinkedInConfig();
  const back = (q: string) => NextResponse.redirect(`${baseUrl}/social?${q}`);

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");
    if (oauthError) return back(`linkedin_error=${encodeURIComponent(oauthError)}`);

    const cookieStore = await cookies();
    const orgId = cookieStore.get("helmsmart-org-id")?.value;
    const stateCookie = cookieStore.get("linkedin_oauth_state")?.value;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!code || !orgId || !user) return back("linkedin_error=missing_context");
    if (!state || !stateCookie || state !== stateCookie) return back("linkedin_error=bad_state");

    const token = await exchangeLinkedInCode(code);
    if (!token) return back("linkedin_error=token_exchange_failed");

    const info = await fetchLinkedInUserInfo(token.accessToken);
    if (!info) return back("linkedin_error=userinfo_failed");

    const expiresAt = new Date(Date.now() + token.expiresIn * 1000).toISOString();

    const db = await createServiceClient();
    const { error: dbErr } = await db.from("org_oauth_tokens").upsert(
      {
        organization_id: orgId,
        provider: "linkedin",
        access_token: encryptLinkedInToken(token.accessToken),
        token_type: "Bearer",
        expires_at: expiresAt,
        scope: "openid profile email w_member_social",
        // account_email carries the member/author URN for LinkedIn (see lib/linkedin.ts).
        account_email: info.memberUrn,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,provider" },
    );
    if (dbErr) {
      console.error("[linkedin] token upsert error:", dbErr);
      return back("linkedin_error=save_failed");
    }

    const res = back("linkedin=connected");
    res.cookies.delete("linkedin_oauth_state");
    return res;
  } catch (e) {
    console.error("[linkedin] callback error:", e);
    return back("linkedin_error=server_error");
  }
}
