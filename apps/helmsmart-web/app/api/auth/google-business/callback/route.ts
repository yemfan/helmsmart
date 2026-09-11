/**
 * GET /api/auth/google-business/callback
 * Google redirects here after consent. Verifies the CSRF nonce, exchanges the
 * code for tokens, and stores them against the logged-in user's active org.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getGoogleBusinessConfig } from "@/lib/google-business";
import { getMemberOrgId } from "@/lib/auth/org-context";

export async function GET(req: Request) {
  const { clientId, clientSecret, redirectUri, baseUrl } = getGoogleBusinessConfig();
  const back = (q: string) => NextResponse.redirect(`${baseUrl}/google?${q}`);

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");
    if (oauthError) return back(`gmb_error=${encodeURIComponent(oauthError)}`);

    const cookieStore = await cookies();
    const orgId = await getMemberOrgId();
    const stateCookie = cookieStore.get("gmb_oauth_state")?.value;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!code || !orgId || !user) return back("gmb_error=missing_context");
    if (!state || !stateCookie || state !== stateCookie) return back("gmb_error=bad_state");

    // Exchange the code for tokens.
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return back(`gmb_error=${encodeURIComponent(tokenData.error_description || tokenData.error || "token_exchange_failed")}`);
    }

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    // Best-effort: which Google account did they connect?
    let accountEmail: string | null = null;
    try {
      const ui = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (ui.ok) accountEmail = (await ui.json())?.email ?? null;
    } catch {
      /* email is a nicety; ignore */
    }

    // Only overwrite refresh_token when Google returns one (re-connects often omit it).
    const payload: Record<string, unknown> = {
      organization_id: orgId,
      provider: "google_business",
      access_token: tokenData.access_token,
      token_type: tokenData.token_type ?? "Bearer",
      expires_at: expiresAt,
      scope: tokenData.scope ?? null,
      account_email: accountEmail,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (tokenData.refresh_token) payload.refresh_token = tokenData.refresh_token;

    const db = await createServiceClient();
    const { error: dbErr } = await db
      .from("org_oauth_tokens")
      .upsert(payload, { onConflict: "organization_id,provider" });
    if (dbErr) {
      console.error("[gmb] token upsert error:", dbErr);
      return back("gmb_error=save_failed");
    }

    const res = back("gmb=connected");
    res.cookies.delete("gmb_oauth_state");
    return res;
  } catch (e) {
    console.error("[gmb] callback error:", e);
    return back("gmb_error=server_error");
  }
}
