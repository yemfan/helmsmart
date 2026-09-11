/**
 * GET /api/auth/google-business
 * Starts the Google Business Profile OAuth flow for the logged-in user's active org.
 * Sets a short-lived CSRF nonce cookie; the org is taken from the session in
 * the callback (never from a spoofable state param).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGoogleBusinessConfig, GOOGLE_BUSINESS_SCOPES, isGoogleBusinessConfigured } from "@/lib/google-business";
import { getMemberOrgId } from "@/lib/auth/org-context";

export async function GET() {
  const { clientId, redirectUri, baseUrl } = getGoogleBusinessConfig();

  if (!isGoogleBusinessConfigured()) {
    return NextResponse.redirect(`${baseUrl}/marketing?gmb_error=not_configured`);
  }

  const orgId = await getMemberOrgId();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!orgId || !user) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  const nonce = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: clientId!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_BUSINESS_SCOPES,
    access_type: "offline",
    prompt: "select_account",
    include_granted_scopes: "true",
    state: nonce,
  });

  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  res.cookies.set("gmb_oauth_state", nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
