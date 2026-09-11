/**
 * GET /api/auth/google-calendar
 * Starts the Google Calendar OAuth flow for the logged-in user's active org.
 * Sets a short-lived CSRF nonce cookie; the org is taken from the session in
 * the callback (never from a spoofable state param).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGoogleCalendarConfig, GOOGLE_CALENDAR_SCOPES, isGoogleCalendarConfigured } from "@/lib/google-calendar";
import { getMemberOrgId } from "@/lib/auth/org-context";

export async function GET() {
  const { clientId, redirectUri, baseUrl } = getGoogleCalendarConfig();

  if (!isGoogleCalendarConfigured()) {
    return NextResponse.redirect(`${baseUrl}/voice?gcal_error=not_configured`);
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
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES,
    access_type: "offline",
    prompt: "select_account",
    include_granted_scopes: "true",
    state: nonce,
  });

  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  res.cookies.set("gcal_oauth_state", nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
