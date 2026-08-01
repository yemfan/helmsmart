import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdapter } from "@/lib/oauth";
import { upsertConnection } from "@/lib/social";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** OAuth callback: verify state, exchange the code, store the connection(s). */
export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const url = new URL(req.url);
  const adapter = getAdapter(platform);
  if (!adapter) return NextResponse.redirect(new URL("/?social=error", url.origin));

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const store = await cookies();
  const expected = store.get(`sc_state_${platform}`)?.value;
  store.delete(`sc_state_${platform}`);

  if (oauthError) return NextResponse.redirect(new URL(`/?social=denied&provider=${platform}`, url.origin));
  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(new URL(`/?social=error&provider=${platform}`, url.origin));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", url.origin));

  try {
    const connections = await adapter.exchange(code, url.origin);
    for (const c of connections) await upsertConnection(user.id, c);
    return NextResponse.redirect(new URL(`/?social=connected&provider=${platform}`, url.origin));
  } catch {
    return NextResponse.redirect(new URL(`/?social=error&provider=${platform}`, url.origin));
  }
}
