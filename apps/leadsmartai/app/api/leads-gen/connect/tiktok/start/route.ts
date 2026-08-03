import { NextResponse } from "next/server";
import crypto from "node:crypto";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { generateAuthorizeUrl, signState, tiktokConfigured } from "@/lib/leads-gen/tiktok-oauth";

export const runtime = "nodejs";

/**
 * GET /api/leads-gen/connect/tiktok/start
 *
 * Initiates the TikTok Login Kit OAuth flow. Same pattern as the
 * Pinterest/Threads/LinkedIn start routes: sign a state token bound to the
 * agent, set it as a short-lived HttpOnly cookie, redirect to TikTok's consent
 * screen. Plan gate: Pro or higher — mirrors the other Quick Post connectors.
 */
export async function GET() {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;

    if (!tiktokConfigured()) {
      return NextResponse.json({ ok: false, error: "TikTok is not configured yet." }, { status: 503 });
    }
    if (auth.planType === "free") {
      return NextResponse.json(
        { ok: false, error: "Connecting TikTok requires Pro or higher." },
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
    res.cookies.set("tiktok_oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax", // OAuth callback is cross-site (from tiktok.com)
      maxAge: 10 * 60,
      path: "/",
    });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to start OAuth";
    console.error("[leads-gen/connect/tiktok/start]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
