import { NextResponse } from "next/server";

import {
  PINTEREST_OAUTH_SCOPES,
  exchangeCodeForToken,
  fetchDefaultBoard,
  fetchProfile,
  verifyState,
} from "@/lib/leads-gen/pinterest-oauth";
import { encryptToken } from "@/lib/leads-gen/token-enc";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// Token exchange + profile + boards lookup is three sequential REST calls.
export const maxDuration = 60;

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * GET /api/leads-gen/connect/pinterest/callback?code=<x>&state=<y>
 *
 * Handles the Pinterest OAuth redirect. Flow:
 *   1. Verify state (HMAC signature + cookie match + freshness)
 *   2. Exchange the code for an access + refresh token
 *   3. Fetch the profile (username)
 *   4. Fetch a default board (Pins require one)
 *   5. Upsert one social_accounts row (platform='pinterest') keyed by
 *      (agent_id, platform, pinterest_username)
 *   6. Redirect back to the connect page with a success / error flash
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const userError = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  let mobileReturnTo: string | null = null;
  const webRedirectBase = "/dashboard/leads/generate/connect";

  function back(params: Record<string, string>): NextResponse {
    const q = new URLSearchParams({ ...params, network: "pinterest" }).toString();
    if (mobileReturnTo) {
      const sep = mobileReturnTo.includes("?") ? "&" : "?";
      return NextResponse.redirect(`${mobileReturnTo}${sep}${q}`, { status: 302 });
    }
    return NextResponse.redirect(new URL(`${webRedirectBase}?${q}`, req.url), { status: 302 });
  }

  if (userError) {
    return back({ status: "cancelled", reason: errorDescription || userError });
  }
  if (!code || !state) {
    return back({ status: "error", reason: "Missing code or state" });
  }

  let agentId: string;
  try {
    const payload = verifyState(state, STATE_MAX_AGE_MS);
    agentId = payload.agentId;
    if (payload.returnTo) {
      if (!/^leadsmart:\/\//i.test(payload.returnTo)) {
        throw new Error("Invalid returnTo scheme");
      }
      mobileReturnTo = payload.returnTo;
    } else {
      const cookieState = req.headers
        .get("cookie")
        ?.match(/pinterest_oauth_state=([^;]+)/)?.[1];
      if (!cookieState || decodeURIComponent(cookieState) !== state) {
        throw new Error("State cookie mismatch");
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "State verification failed";
    console.warn("[pinterest/callback] state verification failed:", msg);
    return back({ status: "error", reason: "Session expired. Please try again." });
  }

  try {
    // 2. Exchange code → access + refresh token.
    const token = await exchangeCodeForToken(code);
    const tokenExpiresAt = new Date(Date.now() + token.expiresIn * 1000).toISOString();

    // 3. Profile (username keys the row).
    const profile = await fetchProfile(token.accessToken);
    if (!profile.username) {
      return back({ status: "error", reason: "Could not read your Pinterest username." });
    }

    // 4. Default board — a Pin always needs one.
    const board = await fetchDefaultBoard(token.accessToken);

    // 5. Upsert one social_accounts row keyed by (agent_id, platform, username).
    const nowIso = new Date().toISOString();
    const row = {
      agent_id: agentId,
      platform: "pinterest",
      account_display_name: profile.businessName ?? profile.username,
      account_picture_url: profile.pictureUrl,
      pinterest_username: profile.username,
      pinterest_board_id: board.id,
      pinterest_board_name: board.name,
      user_access_token_enc: encryptToken(token.accessToken),
      pinterest_refresh_token_enc: token.refreshToken ? encryptToken(token.refreshToken) : null,
      user_token_expires_at: tokenExpiresAt,
      scopes: PINTEREST_OAUTH_SCOPES as unknown as string[],
      status: "connected",
      last_error: null,
      last_refreshed_at: nowIso,
      updated_at: nowIso,
    };

    // Manual upsert — the unique index is PARTIAL (WHERE pinterest_username IS
    // NOT NULL), which supabase-js's onConflict can't target.
    const { data: existing } = await supabaseAdmin
      .from("social_accounts")
      .select("id")
      .eq("agent_id", agentId)
      .eq("platform", "pinterest")
      .eq("pinterest_username", profile.username)
      .maybeSingle();
    if ((existing as { id?: string } | null)?.id) {
      const { error: updErr } = await supabaseAdmin
        .from("social_accounts")
        .update(row as never)
        .eq("id", (existing as { id: string }).id);
      if (updErr) throw new Error(updErr.message);
    } else {
      const { error: insErr } = await supabaseAdmin
        .from("social_accounts")
        .insert({ ...row, connected_at: nowIso } as never);
      if (insErr) throw new Error(insErr.message);
    }

    const res = back({ status: "success", count: "1" });
    res.cookies.set("pinterest_oauth_state", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OAuth callback failed";
    console.error("[pinterest/callback]", e);
    return back({ status: "error", reason: msg.slice(0, 200) });
  }
}
