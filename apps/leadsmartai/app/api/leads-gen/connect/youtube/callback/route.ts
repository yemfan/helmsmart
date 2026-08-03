import { NextResponse } from "next/server";

import {
  YOUTUBE_OAUTH_SCOPES,
  exchangeCodeForToken,
  fetchChannel,
  verifyState,
} from "@/lib/leads-gen/youtube-oauth";
import { encryptToken } from "@/lib/leads-gen/token-enc";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * GET /api/leads-gen/connect/youtube/callback?code=<x>&state=<y>
 * Verify state → exchange code → read the channel → upsert one social_accounts
 * row (platform='youtube') keyed by (agent_id, platform, youtube_channel_id).
 * Mirrors the TikTok callback.
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
    const q = new URLSearchParams({ ...params, network: "youtube" }).toString();
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
      const cookieState = req.headers.get("cookie")?.match(/youtube_oauth_state=([^;]+)/)?.[1];
      if (!cookieState || decodeURIComponent(cookieState) !== state) {
        throw new Error("State cookie mismatch");
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "State verification failed";
    console.warn("[youtube/callback] state verification failed:", msg);
    return back({ status: "error", reason: "Session expired. Please try again." });
  }

  try {
    const token = await exchangeCodeForToken(code);
    const tokenExpiresAt = new Date(Date.now() + token.expiresIn * 1000).toISOString();

    const channel = await fetchChannel(token.accessToken);
    if (!channel?.id) {
      return back({ status: "error", reason: "This Google account has no YouTube channel. Create one, then reconnect." });
    }

    const nowIso = new Date().toISOString();
    const row = {
      agent_id: agentId,
      platform: "youtube",
      account_display_name: channel.title ?? "YouTube",
      youtube_channel_id: channel.id,
      youtube_channel_title: channel.title,
      user_access_token_enc: encryptToken(token.accessToken),
      youtube_refresh_token_enc: token.refreshToken ? encryptToken(token.refreshToken) : null,
      user_token_expires_at: tokenExpiresAt,
      scopes: YOUTUBE_OAUTH_SCOPES as unknown as string[],
      status: "connected",
      last_error: null,
      last_refreshed_at: nowIso,
      updated_at: nowIso,
    };

    // Manual upsert — the unique index is PARTIAL (WHERE youtube_channel_id IS NOT NULL).
    const { data: existing } = await supabaseAdmin
      .from("social_accounts")
      .select("id")
      .eq("agent_id", agentId)
      .eq("platform", "youtube")
      .eq("youtube_channel_id", channel.id)
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
    res.cookies.set("youtube_oauth_state", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OAuth callback failed";
    console.error("[youtube/callback]", e);
    return back({ status: "error", reason: msg.slice(0, 200) });
  }
}
