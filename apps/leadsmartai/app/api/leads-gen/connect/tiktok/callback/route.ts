import { NextResponse } from "next/server";

import {
  TIKTOK_OAUTH_SCOPES,
  exchangeCodeForToken,
  fetchUserInfo,
  verifyState,
  type TikTokUser,
} from "@/lib/leads-gen/tiktok-oauth";
import { encryptToken } from "@/lib/leads-gen/token-enc";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// Token exchange + profile lookup are two sequential REST calls.
export const maxDuration = 60;

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * GET /api/leads-gen/connect/tiktok/callback?code=<x>&state=<y>
 *
 * Handles the TikTok OAuth redirect: verify state → exchange code → read the
 * profile → upsert one social_accounts row (platform='tiktok') keyed by
 * (agent_id, platform, tiktok_open_id) → redirect back with a flash. Mirrors
 * the Pinterest callback.
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
    const q = new URLSearchParams({ ...params, network: "tiktok" }).toString();
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
      const cookieState = req.headers.get("cookie")?.match(/tiktok_oauth_state=([^;]+)/)?.[1];
      if (!cookieState || decodeURIComponent(cookieState) !== state) {
        throw new Error("State cookie mismatch");
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "State verification failed";
    console.warn("[tiktok/callback] state verification failed:", msg);
    return back({ status: "error", reason: "Session expired. Please try again." });
  }

  try {
    const token = await exchangeCodeForToken(code);
    const tokenExpiresAt = new Date(Date.now() + token.expiresIn * 1000).toISOString();

    // The profile scope (user.info.basic) is an OPTIONAL toggle on TikTok's
    // consent screen — declining it must not block a connection that can still
    // publish. Fall back to the token's open_id and a plain label.
    let profile: TikTokUser = { openId: null, displayName: null, avatarUrl: null, username: null };
    try {
      profile = await fetchUserInfo(token.accessToken);
    } catch (e) {
      console.warn(
        "[tiktok/callback] profile lookup skipped:",
        e instanceof Error ? e.message : e,
      );
    }

    const openId = profile.openId ?? token.openId;
    if (!openId) {
      return back({
        status: "error",
        reason:
          'TikTok didn\'t share your account id. Reconnect and leave "Access your profile info" switched on.',
      });
    }

    const nowIso = new Date().toISOString();
    const row = {
      agent_id: agentId,
      platform: "tiktok",
      account_display_name: profile.displayName ?? profile.username ?? "TikTok",
      account_picture_url: profile.avatarUrl,
      tiktok_open_id: openId,
      tiktok_username: profile.username,
      user_access_token_enc: encryptToken(token.accessToken),
      tiktok_refresh_token_enc: token.refreshToken ? encryptToken(token.refreshToken) : null,
      user_token_expires_at: tokenExpiresAt,
      // Record what was actually GRANTED (the user may decline a toggle), not
      // what we requested — otherwise the stored list silently lies.
      scopes: (token.scope
        ? token.scope.split(",").map((s) => s.trim()).filter(Boolean)
        : (TIKTOK_OAUTH_SCOPES as unknown as string[])) as unknown as string[],
      status: "connected",
      last_error: null,
      last_refreshed_at: nowIso,
      updated_at: nowIso,
    };

    // Manual upsert — the unique index is PARTIAL (WHERE tiktok_open_id IS NOT NULL).
    const { data: existing } = await supabaseAdmin
      .from("social_accounts")
      .select("id")
      .eq("agent_id", agentId)
      .eq("platform", "tiktok")
      .eq("tiktok_open_id", openId)
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
    res.cookies.set("tiktok_oauth_state", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OAuth callback failed";
    console.error("[tiktok/callback]", e);
    return back({ status: "error", reason: msg.slice(0, 200) });
  }
}
