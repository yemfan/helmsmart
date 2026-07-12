import { NextResponse } from "next/server";

import {
  LINKEDIN_OAUTH_SCOPES,
  exchangeCodeForToken,
  fetchUserInfo,
  verifyState,
} from "@/lib/leads-gen/linkedin-oauth";
import { encryptToken } from "@/lib/leads-gen/token-enc";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// Token exchange + userinfo lookup is just two sequential REST
// calls but LinkedIn has been known to be slow on cold OAuth flows.
export const maxDuration = 60;

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // mirrors the cookie max-age in /start

/**
 * GET /api/leads-gen/connect/linkedin/callback?code=<x>&state=<y>
 *
 * Handles LinkedIn's OAuth redirect. Flow:
 *   1. Verify state (HMAC signature + cookie match + freshness)
 *   2. Exchange the code for an access token (~60-day expiry)
 *   3. Fetch user info via OIDC /v2/userinfo — gives us the member
 *      URN we'll need as the post `author`
 *   4. Upsert one social_accounts row (platform='linkedin') keyed
 *      by (agent_id, platform, linkedin_member_urn)
 *   5. Redirect back to the connection page with a success / error
 *      flash query param
 *
 * The handler always redirects on completion — even on error —
 * because OAuth callbacks land in the browser tab and a JSON
 * response would be a dead end.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const userError = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // Mobile callers pass `returnTo: leadsmart://...` in the state;
  // the callback redirects to that deep link instead of the web
  // connect page. Same pattern as meta-oauth — we resolve after
  // state verification so a forged state can't trick us into
  // redirecting somewhere bad.
  let mobileReturnTo: string | null = null;
  const webRedirectBase = "/dashboard/leads/generate/connect";

  function back(params: Record<string, string>): NextResponse {
    if (mobileReturnTo) {
      const q = new URLSearchParams({
        ...params,
        network: "linkedin",
      }).toString();
      const sep = mobileReturnTo.includes("?") ? "&" : "?";
      return NextResponse.redirect(`${mobileReturnTo}${sep}${q}`, {
        status: 302,
      });
    }
    const q = new URLSearchParams({ ...params, network: "linkedin" }).toString();
    return NextResponse.redirect(
      new URL(`${webRedirectBase}?${q}`, req.url),
      { status: 302 },
    );
  }

  // 0. User-side rejection — LinkedIn echoes back error params if
  //    the agent denied the dialog.
  if (userError) {
    return back({
      status: "cancelled",
      reason: errorDescription || userError,
    });
  }

  if (!code || !state) {
    return back({ status: "error", reason: "Missing code or state" });
  }

  // 1. Verify state — HMAC + freshness. Web flow also requires the
  //    cookie cross-check; mobile flow skips the cookie because the
  //    in-app browser doesn't carry it (state is bound via HMAC +
  //    agentId + the verified leadsmart:// scheme instead).
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
        ?.match(/linkedin_oauth_state=([^;]+)/)?.[1];
      if (!cookieState || decodeURIComponent(cookieState) !== state) {
        throw new Error("State cookie mismatch");
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "State verification failed";
    console.warn("[linkedin/callback] state verification failed:", msg);
    return back({ status: "error", reason: "Session expired. Please try again." });
  }

  try {
    // 2. Exchange code → access token.
    const token = await exchangeCodeForToken(code);
    const tokenExpiresAt = new Date(
      Date.now() + token.expiresIn * 1000,
    ).toISOString();

    // 3. Fetch the user's basic profile via OIDC userinfo.
    const info = await fetchUserInfo(token.accessToken);

    // 4. Upsert one social_accounts row keyed by member URN.
    //    Reusing the same table as Meta keeps the wizard / publish
    //    paths uniform — `platform` discriminates.
    const nowIso = new Date().toISOString();
    const tokenEnc = encryptToken(token.accessToken);
    const row = {
      agent_id: agentId,
      platform: "linkedin",
      account_display_name: info.name,
      account_picture_url: info.pictureUrl,
      linkedin_member_urn: info.memberUrn,
      linkedin_member_email: info.email,
      // We reuse `user_access_token_enc` for the LinkedIn access
      // token. LinkedIn doesn't have the user/page-token split
      // Meta has — there's only one token per member.
      user_access_token_enc: tokenEnc,
      user_token_expires_at: tokenExpiresAt,
      scopes: LINKEDIN_OAUTH_SCOPES as unknown as string[],
      status: "connected",
      last_error: null,
      last_refreshed_at: nowIso,
      updated_at: nowIso,
    };

    // Manual upsert: the `social_accounts_linkedin_unique` index is PARTIAL
    // (WHERE linkedin_member_urn IS NOT NULL), which supabase-js's `onConflict`
    // can't target (it omits the predicate) — Postgres then errors "no unique
    // constraint matching the ON CONFLICT specification". Select-then-write
    // instead, keyed on the same (agent_id, platform, member_urn).
    const { data: existing } = await supabaseAdmin
      .from("social_accounts")
      .select("id")
      .eq("agent_id", agentId)
      .eq("platform", "linkedin")
      .eq("linkedin_member_urn", info.memberUrn)
      .maybeSingle();
    if ((existing as { id?: string } | null)?.id) {
      const { error: updErr } = await supabaseAdmin
        .from("social_accounts")
        .update(row as never)
        .eq("id", (existing as { id: string }).id);
      if (updErr) throw new Error(updErr.message);
    } else {
      const { error: insErr } = await supabaseAdmin.from("social_accounts").insert(row as never);
      if (insErr) throw new Error(insErr.message);
    }

    // Clear the state cookie — single-use, even on success.
    const res = back({ status: "success", count: "1" });
    res.cookies.set("linkedin_oauth_state", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OAuth callback failed";
    console.error("[linkedin/callback]", e);
    return back({ status: "error", reason: msg.slice(0, 200) });
  }
}
