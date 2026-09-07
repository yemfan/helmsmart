import { NextResponse } from "next/server";
import crypto from "node:crypto";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { GA_OAUTH_SCOPES } from "@/lib/leads-gen/google-analytics";
import { generateAuthorizeUrl, signState, youtubeConfigured } from "@/lib/leads-gen/youtube-oauth";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/hub/google/start
 *
 * Begin the Google Analytics (read-only) authorisation. Same Google OAuth
 * client, cookie and registered callback as YouTube; the signed state
 * carries purpose = "analytics" so the callback finishes the right flow.
 * Sent back to the hub's marketing page when Google is not configured,
 * with the reason in the query, rather than a JSON body nobody reads.
 */
export async function GET(req: Request) {
  const auth = await getDashboardAgentContext();
  if (auth.ok === false) return auth.response;

  const backTo = (params: Record<string, string>) =>
    NextResponse.redirect(new URL(`/dashboard/hub?section=analytics&${new URLSearchParams(params)}`, req.url), { status: 302 });

  if (!youtubeConfigured()) return backTo({ google: "error", reason: "not_configured" });

  try {
    const state = signState({
      nonce: crypto.randomBytes(16).toString("hex"),
      agentId: auth.agentId,
      issuedAt: Date.now(),
      purpose: "analytics",
    });
    const res = NextResponse.redirect(generateAuthorizeUrl(state, GA_OAUTH_SCOPES), { status: 302 });
    res.cookies.set("youtube_oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax", // the callback arrives cross-site from accounts.google.com
      maxAge: 10 * 60,
      path: "/",
    });
    return res;
  } catch (e) {
    console.error("[hub/google/start]", e);
    return backTo({ google: "error", reason: "start_failed" });
  }
}
