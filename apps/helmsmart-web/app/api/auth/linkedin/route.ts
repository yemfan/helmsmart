/**
 * GET /api/auth/linkedin
 * Starts the LinkedIn OAuth flow for the logged-in user's active org. Sets a
 * short-lived CSRF nonce cookie; the org is taken from the session in the
 * callback (never from a spoofable state param). Mirrors the google-business
 * start route.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getLinkedInConfig, isLinkedInConfigured, LINKEDIN_SCOPES } from "@/lib/linkedin";

export async function GET() {
  const { clientId, redirectUri, baseUrl } = getLinkedInConfig();

  if (!isLinkedInConfigured()) {
    return NextResponse.redirect(`${baseUrl}/social?linkedin_error=not_configured`);
  }

  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!orgId || !user) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  const nonce = crypto.randomUUID();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId!,
    redirect_uri: redirectUri,
    scope: LINKEDIN_SCOPES,
    state: nonce,
  });

  const res = NextResponse.redirect(
    `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`,
  );
  res.cookies.set("linkedin_oauth_state", nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
