import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode, getChannel } from "@/lib/youtube";
import { upsertConnection } from "@/lib/social";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** OAuth callback: verify state, exchange the code, store the connection. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const store = await cookies();
  const expectedState = store.get("yt_oauth_state")?.value;
  store.delete("yt_oauth_state");

  if (oauthError) return NextResponse.redirect(new URL("/?youtube=denied", url.origin));
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/?youtube=error", url.origin));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", url.origin));

  try {
    const tokens = await exchangeCode(code, url.origin);
    const channel = await getChannel(tokens.access_token);
    await upsertConnection(user.id, {
      platform: "youtube",
      provider_account_id: channel?.id ?? null,
      account_name: channel?.title ?? null,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope ?? null,
    });
    return NextResponse.redirect(new URL("/?youtube=connected", url.origin));
  } catch {
    return NextResponse.redirect(new URL("/?youtube=error", url.origin));
  }
}
