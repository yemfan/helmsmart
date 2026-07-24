import { NextResponse } from "next/server";

import {
  exchangeCodeForShortLivedUserToken,
  exchangeForLongLivedUserToken,
  fetchPagesForUser,
  META_OAUTH_SCOPES,
  verifyState,
} from "@/lib/leads-gen/meta-oauth";
import { encryptToken } from "@/lib/leads-gen/token-enc";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// Token exchange + Page enumeration involves several sequential
// Graph API calls; budget conservatively.
export const maxDuration = 60;

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // mirrors the cookie max-age in /start

/**
 * GET /api/leads-gen/connect/meta/callback?code=<x>&state=<y>
 *
 * Handles Meta's OAuth redirect. Flow:
 *   1. Verify state (HMAC signature + cookie match + freshness)
 *   2. Exchange the code for a short-lived user token
 *   3. Upgrade to a long-lived user token (~60 days)
 *   4. List Pages the user manages, with Page tokens + linked IG
 *   5. Upsert one social_accounts row per Page
 *   6. Redirect the agent back to the connection page with a
 *      success / error flash query param
 *
 * The handler always redirects on completion — even on error —
 * because OAuth callbacks land in the browser tab and a JSON
 * response would be a dead end. The connection page reads the
 * flash param to render success / failure.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const userError = url.searchParams.get("error");
  const errorReason = url.searchParams.get("error_reason");

  // Mobile callers pass `returnTo: leadsmart://...` in the state; the
  // callback redirects to that deep link instead of the web connect
  // page. We resolve the destination after state verification so a
  // malicious state can't trick us into redirecting somewhere bad.
  let mobileReturnTo: string | null = null;
  const webRedirectBase = "/dashboard/leads/generate/connect";

  function back(params: Record<string, string>): NextResponse {
    const q = new URLSearchParams(params).toString();
    // Mobile path: redirect to the verified deep link with the same
    // status params. The mobile app's WebBrowser.openAuthSessionAsync
    // intercepts the leadsmart:// scheme and resolves the OAuth dance.
    if (mobileReturnTo) {
      const sep = mobileReturnTo.includes("?") ? "&" : "?";
      return NextResponse.redirect(
        `${mobileReturnTo}${sep}${q}`,
        { status: 302 },
      );
    }
    return NextResponse.redirect(
      new URL(`${webRedirectBase}?${q}`, req.url),
      { status: 302 },
    );
  }

  // 0. User-side rejection — Meta echoes back error params if the
  //    agent denied the dialog. Friendlier to surface that as a
  //    cancellation than a hard error.
  if (userError) {
    return back({
      status: "cancelled",
      reason: errorReason || userError,
    });
  }

  if (!code || !state) {
    return back({ status: "error", reason: "Missing code or state" });
  }

  // 1. Verify state — HMAC + cookie cross-check + freshness.
  //    Mobile flows skip the cookie check (in-app browsers don't
  //    carry the cookie set on /start because /start isn't called).
  //    The HMAC + freshness + agentId binding is the same defense.
  let agentId: string;
  try {
    const payload = verifyState(state, STATE_MAX_AGE_MS);
    agentId = payload.agentId;
    // Validate the returnTo strictly — only allow the leadsmart://
    // mobile scheme. Prevents the OAuth callback from being abused
    // as an open redirect by a malicious state forger.
    if (payload.returnTo) {
      if (!/^leadsmart:\/\//i.test(payload.returnTo)) {
        throw new Error("Invalid returnTo scheme");
      }
      mobileReturnTo = payload.returnTo;
    } else {
      // Web flow: also require the cookie match.
      const cookieState = req.headers.get("cookie")?.match(/meta_oauth_state=([^;]+)/)?.[1];
      if (!cookieState || decodeURIComponent(cookieState) !== state) {
        throw new Error("State cookie mismatch");
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "State verification failed";
    console.warn("[meta/callback] state verification failed:", msg);
    return back({ status: "error", reason: "Session expired. Please try again." });
  }

  try {
    // 2. Short-lived user token.
    const shortLived = await exchangeCodeForShortLivedUserToken(code);

    // 3. Long-lived user token. If the exchange to long-lived fails
    //    we still have a short-lived one we could use, but a 1-2h
    //    token is too brittle for a CRM integration — surface as
    //    an error rather than store something that'll expire mid-
    //    afternoon.
    const longLived = await exchangeForLongLivedUserToken(shortLived.accessToken);
    const userTokenExpiresAt = longLived.expiresIn
      ? new Date(Date.now() + longLived.expiresIn * 1000).toISOString()
      : null;

    // 4. Enumerate Pages + linked IG accounts.
    const pages = await fetchPagesForUser(longLived.accessToken);
    if (pages.length === 0) {
      // Logged, not just redirected: this path used to leave NOTHING behind in
      // the logs, so a failed connect was undiagnosable after the fact.
      console.warn(
        `[meta/callback] agent ${agentId}: grant returned zero Pages — check that the app has pages_show_list + business_management and that a Page was selected during the grant`,
      );
      return back({
        status: "error",
        reason:
          "No Facebook Pages found on this account. If you have a Page, remove CloseBoss from Facebook → Settings → Apps and Websites, then connect again and tick the Page when asked.",
      });
    }

    // 5. Upsert one row per Page. Re-connecting an existing Page updates the
    //    existing row (fresh tokens, refreshed scopes, last_refreshed_at
    //    stamped).
    //
    //    Manual select-then-write, NOT `.upsert({onConflict})`: the prod
    //    social_accounts table has no unique constraint on
    //    (agent_id, platform, fb_page_id) to target, so onConflict failed with
    //    42P10 — which then surfaced as a generic "OAuth callback failed"
    //    because a PostgrestError isn't an Error instance. This mirrors what
    //    connectionsService + the LinkedIn callback already do, and it throws a
    //    real Error so any future failure shows its actual message.
    const nowIso = new Date().toISOString();
    const userTokenEnc = encryptToken(longLived.accessToken);
    for (const p of pages) {
      const fields = {
        agent_id: agentId,
        platform: "meta",
        account_display_name: p.pageName,
        account_picture_url: p.picture,
        fb_page_id: p.pageId,
        fb_page_name: p.pageName,
        ig_business_user_id: p.igBusinessUserId,
        ig_business_username: p.igBusinessUsername,
        page_access_token_enc: encryptToken(p.pageAccessToken),
        user_access_token_enc: userTokenEnc,
        user_token_expires_at: userTokenExpiresAt,
        scopes: META_OAUTH_SCOPES as unknown as string[],
        status: "connected",
        last_error: null,
        last_refreshed_at: nowIso,
        updated_at: nowIso,
      };

      const { data: existing } = await supabaseAdmin
        .from("social_accounts")
        .select("id")
        .eq("agent_id", agentId)
        .eq("platform", "meta")
        .eq("fb_page_id", p.pageId)
        .maybeSingle();

      if ((existing as { id?: string } | null)?.id) {
        const { error } = await supabaseAdmin
          .from("social_accounts")
          .update(fields as never)
          .eq("id", (existing as { id: string }).id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabaseAdmin
          .from("social_accounts")
          .insert({ ...fields, connected_at: nowIso } as never);
        if (error) throw new Error(error.message);
      }
    }

    // Clear the state cookie — single-use, even on success.
    const res = back({
      status: "success",
      count: String(pages.length),
    });
    res.cookies.set("meta_oauth_state", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OAuth callback failed";
    console.error("[meta/callback]", e);
    return back({ status: "error", reason: msg.slice(0, 200) });
  }
}
