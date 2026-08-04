/**
 * GET /api/auth/youtube/callback
 * Google redirects here after consent. Verifies the CSRF nonce, exchanges the
 * code for tokens, reads the channel id/title, and stores the (encrypted) tokens
 * against the logged-in user's active org. Mirrors the LinkedIn callback.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  getYouTubeConfig,
  exchangeYouTubeCode,
  fetchYouTubeChannel,
  encryptYouTubeToken,
  YOUTUBE_SCOPES,
} from "@/lib/youtube";

export async function GET(req: Request) {
  const { baseUrl } = getYouTubeConfig();
  const back = (q: string) => NextResponse.redirect(`${baseUrl}/social?${q}`);

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");
    if (oauthError) return back(`youtube_error=${encodeURIComponent(oauthError)}`);

    const cookieStore = await cookies();
    const orgId = cookieStore.get("helmsmart-org-id")?.value;
    const stateCookie = cookieStore.get("youtube_oauth_state")?.value;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!code || !orgId || !user) return back("youtube_error=missing_context");
    if (!state || !stateCookie || state !== stateCookie) return back("youtube_error=bad_state");

    const token = await exchangeYouTubeCode(code);
    if (!token) return back("youtube_error=token_exchange_failed");

    const channel = await fetchYouTubeChannel(token.accessToken);
    const expiresAt = new Date(Date.now() + token.expiresIn * 1000).toISOString();

    const db = await createServiceClient();
    const { error: dbErr } = await db.from("org_oauth_tokens").upsert(
      {
        organization_id: orgId,
        provider: "youtube",
        access_token: encryptYouTubeToken(token.accessToken),
        refresh_token: token.refreshToken ? encryptYouTubeToken(token.refreshToken) : null,
        token_type: "Bearer",
        expires_at: expiresAt,
        scope: token.scope ?? YOUTUBE_SCOPES,
        account_email: channel.id ?? null,
        metadata: { channel_title: channel.title },
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,provider" },
    );
    if (dbErr) {
      console.error("[youtube] token upsert error:", dbErr);
      return back("youtube_error=save_failed");
    }

    const res = back("youtube=connected");
    res.cookies.delete("youtube_oauth_state");
    return res;
  } catch (e) {
    console.error("[youtube] callback error:", e);
    return back("youtube_error=server_error");
  }
}
