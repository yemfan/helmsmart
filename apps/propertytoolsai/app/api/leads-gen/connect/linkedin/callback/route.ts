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
export const maxDuration = 60;

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // mirrors the cookie max-age in /start

/**
 * GET /api/leads-gen/connect/linkedin/callback?code=<x>&state=<y>
 *
 * Handles LinkedIn's OAuth redirect: verify state (HMAC + cookie + freshness)
 * → exchange code for a ~60-day token → fetch the member URN via OIDC userinfo
 * → upsert one `social_accounts` row (platform='linkedin'). Always redirects on
 * completion (OAuth callbacks land in a browser tab).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const userError = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  const webRedirectBase = "/dashboard";

  function back(params: Record<string, string>): NextResponse {
    const q = new URLSearchParams({ ...params, network: "linkedin" }).toString();
    return NextResponse.redirect(new URL(`${webRedirectBase}?${q}`, req.url), {
      status: 302,
    });
  }

  if (userError) {
    return back({ status: "cancelled", reason: errorDescription || userError });
  }
  if (!code || !state) {
    return back({ status: "error", reason: "Missing code or state" });
  }

  // Verify state — HMAC + freshness + single-use cookie cross-check.
  let agentId: string;
  try {
    const payload = verifyState(state, STATE_MAX_AGE_MS);
    agentId = payload.agentId;
    const cookieState = req.headers
      .get("cookie")
      ?.match(/linkedin_oauth_state=([^;]+)/)?.[1];
    if (!cookieState || decodeURIComponent(cookieState) !== state) {
      throw new Error("State cookie mismatch");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "State verification failed";
    console.warn("[linkedin/callback] state verification failed:", msg);
    return back({ status: "error", reason: "Session expired. Please try again." });
  }

  try {
    const token = await exchangeCodeForToken(code);
    const tokenExpiresAt = new Date(Date.now() + token.expiresIn * 1000).toISOString();
    const info = await fetchUserInfo(token.accessToken);

    const nowIso = new Date().toISOString();
    const tokenEnc = encryptToken(token.accessToken);
    const row = {
      agent_id: agentId,
      platform: "linkedin",
      account_display_name: info.name,
      account_picture_url: info.pictureUrl,
      linkedin_member_urn: info.memberUrn,
      linkedin_member_email: info.email,
      user_access_token_enc: tokenEnc,
      user_token_expires_at: tokenExpiresAt,
      scopes: LINKEDIN_OAUTH_SCOPES as unknown as string[],
      status: "connected",
      last_error: null,
      last_refreshed_at: nowIso,
      updated_at: nowIso,
    };

    // Manual upsert: `social_accounts_linkedin_unique` is a PARTIAL index
    // (WHERE linkedin_member_urn IS NOT NULL), which supabase-js's onConflict
    // can't target. Select-then-write keyed on (agent_id, platform, member_urn).
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
      const { error: insErr } = await supabaseAdmin
        .from("social_accounts")
        .insert(row as never);
      if (insErr) throw new Error(insErr.message);
    }

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
