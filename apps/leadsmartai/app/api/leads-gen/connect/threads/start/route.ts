import { NextResponse } from "next/server";
import crypto from "node:crypto";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { generateAuthorizeUrl, signState } from "@/lib/leads-gen/threads-oauth";

export const runtime = "nodejs";

/**
 * GET /api/leads-gen/connect/threads/start
 *
 * Initiates the Threads OAuth flow. Same pattern as the LinkedIn/Meta start
 * routes: sign a state token bound to the agent, set it as a short-lived
 * HttpOnly cookie, redirect to the Threads OAuth dialog (hosted on
 * threads.net, not facebook.com).
 *
 * Scopes (see threads-oauth.ts): threads_basic + threads_content_publish.
 *
 * Plan gate: Pro or higher — Threads organic posting is bundled with the same
 * Quick Post feature that gates Meta/LinkedIn, so we mirror that gate here.
 */
export async function GET() {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;

    if (auth.planType === "free") {
      return NextResponse.json(
        { ok: false, error: "Connecting Threads requires Pro or higher." },
        { status: 402 },
      );
    }

    // Sign state bound to this agent so a stolen state token from another
    // session can't be replayed against our callback.
    const state = signState({
      nonce: crypto.randomBytes(16).toString("hex"),
      agentId: auth.agentId,
      issuedAt: Date.now(),
    });

    const url = generateAuthorizeUrl(state);
    const res = NextResponse.redirect(url, { status: 302 });
    // 10-minute cookie — covers the OAuth round-trip + a slow login + a 2FA
    // challenge. After that the state signature timestamp also rejects.
    res.cookies.set("threads_oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax", // OAuth callback is cross-site (from threads.net), lax is required
      maxAge: 10 * 60,
      path: "/",
    });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to start OAuth";
    console.error("[leads-gen/connect/threads/start]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
