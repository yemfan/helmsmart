import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * OAuth callback (Google sign-in): exchange the auth code for a session, then
 * land on Home. New users are auto-provisioned (profile + free credits) by the
 * existing handle_new_user trigger — same as email signups.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?oauth=failed", url.origin));

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?oauth=failed", url.origin));

  return NextResponse.redirect(new URL("/", url.origin));
}
