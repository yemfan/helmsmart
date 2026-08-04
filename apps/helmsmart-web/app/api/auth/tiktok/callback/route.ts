/**
 * GET /api/auth/tiktok/callback
 * TikTok redirects here after consent. Verifies the CSRF nonce, exchanges the
 * code for tokens, reads the account's open_id, and stores the (encrypted) tokens
 * against the logged-in user's active org. Mirrors the LinkedIn callback.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  getTikTokConfig,
  exchangeTikTokCode,
  fetchTikTokUser,
  encryptTikTokToken,
  TIKTOK_SCOPES,
} from "@/lib/tiktok";

export async function GET(req: Request) {
  const { baseUrl } = getTikTokConfig();
  const back = (q: string) => NextResponse.redirect(`${baseUrl}/social?${q}`);

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");
    if (oauthError) return back(`tiktok_error=${encodeURIComponent(oauthError)}`);

    const cookieStore = await cookies();
    const orgId = cookieStore.get("helmsmart-org-id")?.value;
    const stateCookie = cookieStore.get("tiktok_oauth_state")?.value;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!code || !orgId || !user) return back("tiktok_error=missing_context");
    if (!state || !stateCookie || state !== stateCookie) return back("tiktok_error=bad_state");

    const token = await exchangeTikTokCode(code);
    if (!token) return back("tiktok_error=token_exchange_failed");

    const info = await fetchTikTokUser(token.accessToken);
    const expiresAt = new Date(Date.now() + token.expiresIn * 1000).toISOString();

    const db = await createServiceClient();
    const { error: dbErr } = await db.from("org_oauth_tokens").upsert(
      {
        organization_id: orgId,
        provider: "tiktok",
        access_token: encryptTikTokToken(token.accessToken),
        refresh_token: token.refreshToken ? encryptTikTokToken(token.refreshToken) : null,
        token_type: "Bearer",
        expires_at: expiresAt,
        scope: TIKTOK_SCOPES,
        account_email: info.openId ?? token.openId ?? null,
        metadata: { display_name: info.displayName, username: info.username },
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,provider" },
    );
    if (dbErr) {
      console.error("[tiktok] token upsert error:", dbErr);
      return back("tiktok_error=save_failed");
    }

    const res = back("tiktok=connected");
    res.cookies.delete("tiktok_oauth_state");
    return res;
  } catch (e) {
    console.error("[tiktok] callback error:", e);
    return back("tiktok_error=server_error");
  }
}
