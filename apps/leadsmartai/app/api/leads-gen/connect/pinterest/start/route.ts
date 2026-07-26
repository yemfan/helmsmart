import { NextResponse } from "next/server";
import crypto from "node:crypto";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { generateAuthorizeUrl, signState } from "@/lib/leads-gen/pinterest-oauth";

export const runtime = "nodejs";

/**
 * GET /api/leads-gen/connect/pinterest/start
 *
 * Initiates the Pinterest OAuth flow. Same pattern as the Threads/LinkedIn start
 * routes: sign a state token bound to the agent, set it as a short-lived
 * HttpOnly cookie, redirect to the Pinterest OAuth dialog (www.pinterest.com).
 *
 * Plan gate: Pro or higher — mirrors the other Quick Post connectors.
 */
export async function GET() {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;

    if (auth.planType === "free") {
      return NextResponse.json(
        { ok: false, error: "Connecting Pinterest requires Pro or higher." },
        { status: 402 },
      );
    }

    const state = signState({
      nonce: crypto.randomBytes(16).toString("hex"),
      agentId: auth.agentId,
      issuedAt: Date.now(),
    });

    const url = generateAuthorizeUrl(state);
    const res = NextResponse.redirect(url, { status: 302 });
    res.cookies.set("pinterest_oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax", // OAuth callback is cross-site (from pinterest.com)
      maxAge: 10 * 60,
      path: "/",
    });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to start OAuth";
    console.error("[leads-gen/connect/pinterest/start]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
