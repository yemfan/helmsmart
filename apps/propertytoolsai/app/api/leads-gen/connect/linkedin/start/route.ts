import { NextResponse } from "next/server";
import crypto from "node:crypto";

import { getCurrentProfile } from "@/lib/auth/getCurrentProfile";
import { generateAuthorizeUrl, signState } from "@/lib/leads-gen/linkedin-oauth";

export const runtime = "nodejs";

/**
 * GET /api/leads-gen/connect/linkedin/start
 *
 * Initiates the LinkedIn OAuth flow for the PropertyTools AI brand account.
 * Signs a state token bound to the agent, sets it as a short-lived HttpOnly
 * cookie, and redirects to LinkedIn's OAuth dialog. Scopes: openid + profile +
 * email (userinfo) + w_member_social (post on the member's behalf) — none need
 * partner-program approval.
 */
export async function GET() {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }
    const agentId = profile.agent_id?.trim();
    if (!agentId) {
      return NextResponse.json(
        { ok: false, error: "No CRM agent is linked to this account." },
        { status: 400 },
      );
    }

    const state = signState({
      nonce: crypto.randomBytes(16).toString("hex"),
      agentId,
      issuedAt: Date.now(),
    });

    const url = generateAuthorizeUrl(state);
    const res = NextResponse.redirect(url, { status: 302 });
    res.cookies.set("linkedin_oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax", // OAuth callback is cross-site (from linkedin.com), lax is required
      maxAge: 10 * 60,
      path: "/",
    });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to start OAuth";
    console.error("[leads-gen/connect/linkedin/start]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
