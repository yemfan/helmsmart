import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthUrl, youtubeConfigured } from "@/lib/youtube";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Kick off the YouTube OAuth flow: set a CSRF state cookie, redirect to Google. */
export async function GET(req: Request) {
  if (!youtubeConfigured()) {
    return NextResponse.json({ error: "YouTube publishing isn't configured yet." }, { status: 503 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const origin = new URL(req.url).origin;
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(getAuthUrl(origin, state));
  (await cookies()).set("yt_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
