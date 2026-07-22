import { NextResponse } from "next/server";

import {
  THREADS_OAUTH_SCOPES,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchProfile,
  verifyState,
} from "@/lib/leads-gen/threads-oauth";
import { encryptToken } from "@/lib/leads-gen/token-enc";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// Token exchange (code → short → long-lived) + profile lookup is three
// sequential REST calls; budget conservatively for cold OAuth flows.
export const maxDuration = 60;

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // mirrors the cookie max-age in /start

/**
 * GET /api/leads-gen/connect/threads/callback?code=<x>&state=<y>
 *
 * Handles the Threads OAuth redirect. Flow:
 *   1. Verify state (HMAC signature + cookie match + freshness)
 *   2. Exchange the code for a short-lived token + Threads user id
 *   3. Upgrade to a long-lived (~60-day) token (best-effort)
 *   4. Fetch the profile (id + username)
 *   5. Upsert one social_accounts row (platform='threads') keyed by
 *      (agent_id, platform, threads_user_id)
 *   6. Redirect back to the connect page with a success / error flash
 *
 * Always redirects on completion (even on error) — OAuth callbacks land in a
 * browser tab, so a JSON response would be a dead end.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const userError = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // Mobile callers pass `returnTo: leadsmart://...` in the state; the callback
  // redirects to that deep link instead of the web connect page. Resolved only
  // after state verification so a forged state can't redirect us somewhere bad.
  let mobileReturnTo: string | null = null;
  const webRedirectBase = "/dashboard/leads/generate/connect";

  function back(params: Record<string, string>): NextResponse {
    if (mobileReturnTo) {
      const q = new URLSearchParams({ ...params, network: "threads" }).toString();
      const sep = mobileReturnTo.includes("?") ? "&" : "?";
      return NextResponse.redirect(`${mobileReturnTo}${sep}${q}`, { status: 302 });
    }
    const q = new URLSearchParams({ ...params, network: "threads" }).toString();
    return NextResponse.redirect(new URL(`${webRedirectBase}?${q}`, req.url), {
      status: 302,
    });
  }

  // 0. User-side rejection — Threads echoes back error params if the agent
  //    denied the dialog.
  if (userError) {
    return back({ status: "cancelled", reason: errorDescription || userError });
  }

  if (!code || !state) {
    return back({ status: "error", reason: "Missing code or state" });
  }

  // 1. Verify state — HMAC + freshness. Web flow also requires the cookie
  //    cross-check; mobile flow skips the cookie (the in-app browser doesn't
  //    carry it) and binds via HMAC + agentId + the leadsmart:// scheme.
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
        ?.match(/threads_oauth_state=([^;]+)/)?.[1];
      if (!cookieState || decodeURIComponent(cookieState) !== state) {
        throw new Error("State cookie mismatch");
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "State verification failed";
    console.warn("[threads/callback] state verification failed:", msg);
    return back({ status: "error", reason: "Session expired. Please try again." });
  }

  try {
    // 2. Exchange code → short-lived token + Threads user id.
    const short = await exchangeCodeForToken(code);

    // 3. Upgrade to a long-lived (~60-day) token. Best-effort: if the exchange
    //    fails we fall back to the short-lived token so a connect still lands
    //    (the agent just re-connects sooner).
    let accessToken = short.accessToken;
    let expiresInSec = 60 * 60; // short-lived default (~1h)
    try {
      const long = await exchangeForLongLivedToken(short.accessToken);
      accessToken = long.accessToken;
      expiresInSec = long.expiresIn;
    } catch (e) {
      console.warn(
        "[threads/callback] long-lived exchange failed, using short-lived token:",
        e instanceof Error ? e.message : e,
      );
    }
    const tokenExpiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();

    // 4. Fetch the profile (canonical id + username).
    const profile = await fetchProfile(accessToken);

    // 5. Upsert one social_accounts row keyed by Threads user id.
    const nowIso = new Date().toISOString();
    const tokenEnc = encryptToken(accessToken);
    const row = {
      agent_id: agentId,
      platform: "threads",
      account_display_name: profile.name ?? profile.username,
      account_picture_url: profile.pictureUrl,
      threads_user_id: profile.userId,
      threads_username: profile.username,
      // Threads has one token per account (no user/page split), so we reuse
      // `user_access_token_enc` the same way LinkedIn does.
      user_access_token_enc: tokenEnc,
      user_token_expires_at: tokenExpiresAt,
      scopes: THREADS_OAUTH_SCOPES as unknown as string[],
      status: "connected",
      last_error: null,
      last_refreshed_at: nowIso,
      updated_at: nowIso,
    };

    // Manual upsert: the `social_accounts_threads_unique` index is PARTIAL
    // (WHERE threads_user_id IS NOT NULL), which supabase-js's `onConflict`
    // can't target (it omits the predicate). Select-then-write instead, keyed
    // on the same (agent_id, platform, threads_user_id).
    const { data: existing } = await supabaseAdmin
      .from("social_accounts")
      .select("id")
      .eq("agent_id", agentId)
      .eq("platform", "threads")
      .eq("threads_user_id", profile.userId)
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

    // Clear the state cookie — single-use, even on success.
    const res = back({ status: "success", count: "1" });
    res.cookies.set("threads_oauth_state", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OAuth callback failed";
    console.error("[threads/callback]", e);
    return back({ status: "error", reason: msg.slice(0, 200) });
  }
}
