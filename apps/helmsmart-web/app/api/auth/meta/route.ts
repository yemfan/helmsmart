/**
 * GET /api/auth/meta
 * Starts the Facebook/Instagram OAuth flow for the logged-in user's active org.
 * Sets a short-lived CSRF nonce cookie; the org is taken from the session in the
 * callback (never from a spoofable state param). Mirrors the LinkedIn start
 * route.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getMetaConfig, isMetaConfigured, metaAuthUrl } from "@/lib/meta";

export async function GET() {
  const { baseUrl } = getMetaConfig();

  if (!isMetaConfigured()) {
    return NextResponse.redirect(`${baseUrl}/social?meta_error=not_configured`);
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
  const res = NextResponse.redirect(metaAuthUrl(nonce));
  res.cookies.set("meta_oauth_state", nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
