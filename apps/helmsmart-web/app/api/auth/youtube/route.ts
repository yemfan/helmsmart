/**
 * GET /api/auth/youtube
 * Starts the YouTube (Google) OAuth flow for the logged-in user's active org.
 * Sets a short-lived CSRF nonce cookie; the org comes from the session cookie in
 * the callback. Mirrors the LinkedIn start route.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getYouTubeConfig, isYouTubeConfigured, youtubeAuthorizeUrl } from "@/lib/youtube";

export async function GET() {
  const { baseUrl } = getYouTubeConfig();
  if (!isYouTubeConfigured()) {
    return NextResponse.redirect(`${baseUrl}/social?youtube_error=not_configured`);
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
  const res = NextResponse.redirect(youtubeAuthorizeUrl(nonce));
  res.cookies.set("youtube_oauth_state", nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
