import { NextResponse } from "next/server";
import crypto from "node:crypto";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { generateAuthorizeUrl, signState, youtubeConfigured } from "@/lib/leads-gen/youtube-oauth";

export const runtime = "nodejs";

/**
 * GET /api/leads-gen/connect/youtube/start
 * Initiates the Google/YouTube OAuth flow. Same pattern as the TikTok/Pinterest
 * start routes. Plan gate: Pro or higher.
 */
export async function GET() {
  try {
    const auth = await getDashboardAgentContext();
    if (auth.ok === false) return auth.response;

    if (!youtubeConfigured()) {
      return NextResponse.json({ ok: false, error: "YouTube is not configured yet." }, { status: 503 });
    }
    if (auth.planType === "free") {
      return NextResponse.json(
        { ok: false, error: "Connecting YouTube requires Pro or higher." },
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
    res.cookies.set("youtube_oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax", // OAuth callback is cross-site (from accounts.google.com)
      maxAge: 10 * 60,
      path: "/",
    });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to start OAuth";
    console.error("[leads-gen/connect/youtube/start]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
