import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getGoogleOAuthConfig } from "@/lib/google-calendar/config";
import { encryptToken, encryptTokenOptional } from "@/lib/leads-gen/token-enc";

/**
 * GET /api/auth/google-calendar/callback
 * Google redirects here after the user consents.
 * Exchanges the authorization code for tokens and stores them.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const agentId = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    const { baseUrl } = getGoogleOAuthConfig();

    if (error) {
      return NextResponse.redirect(`${baseUrl}/dashboard/calendar?gcal_error=${encodeURIComponent(error)}`);
    }

    if (!code || !agentId) {
      return NextResponse.redirect(`${baseUrl}/dashboard/calendar?gcal_error=missing_code`);
    }

    const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      const errMsg = tokenData.error_description || tokenData.error || "token_exchange_failed";
      return NextResponse.redirect(`${baseUrl}/dashboard/calendar?gcal_error=${encodeURIComponent(errMsg)}`);
    }

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    // Upsert token
    const { error: dbErr } = await supabaseServer
      .from("agent_oauth_tokens")
      .upsert(
        {
          agent_id: agentId as any,
          provider: "google",
          // Encrypt OAuth tokens at rest (AES-256-GCM) — same envelope as
          // social_accounts. Reads go through decryptTokenLenient.
          access_token: encryptToken(tokenData.access_token),
          refresh_token: encryptTokenOptional(tokenData.refresh_token ?? null),
          token_type: tokenData.token_type ?? "Bearer",
          expires_at: expiresAt,
          scope: tokenData.scope ?? null,
          calendar_id: "primary",
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "agent_id,provider" }
      );

    if (dbErr) {
      console.error("Google Calendar token upsert error:", dbErr);
      return NextResponse.redirect(`${baseUrl}/dashboard/calendar?gcal_error=save_failed`);
    }

    return NextResponse.redirect(`${baseUrl}/dashboard/calendar?gcal_connected=1`);
  } catch (e: any) {
    console.error("Google Calendar callback error:", e);
    const { baseUrl } = getGoogleOAuthConfig();
    return NextResponse.redirect(`${baseUrl}/dashboard/calendar?gcal_error=server_error`);
  }
}
