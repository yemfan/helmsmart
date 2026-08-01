import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdapter } from "@/lib/oauth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Start OAuth for a provider: set a CSRF state cookie, redirect to consent. */
export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const adapter = getAdapter(platform);
  if (!adapter) return NextResponse.json({ error: "Unknown provider." }, { status: 404 });
  if (!adapter.configured()) {
    return NextResponse.json({ error: `${adapter.label} publishing isn't set up yet.` }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const origin = new URL(req.url).origin;
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(adapter.authUrl(origin, state));
  (await cookies()).set(`sc_state_${platform}`, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
